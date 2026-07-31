const { Pool } = require("pg");

// DATABASE_URL points at a real Postgres instance - locally during
// development (e.g. a free Supabase project) and the same one once
// deployed, so data actually persists across restarts and redeploys.
// Supabase (and most hosted Postgres) requires SSL; enable it whenever the
// connection string looks like a remote host rather than localhost.
const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/splittify",
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    -- Registered users. A member's email in a group only lets them see/act
    -- in that group once they've signed up and logged in with that email.
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      -- A "direct" group is an auto-created, hidden pairing used to track
      -- quick expenses between people outside of any named group.
      is_direct INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT,
      UNIQUE(group_id, email)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      paid_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- One row per member per expense: how much of that expense they owe.
    -- Equal splits and unequal (custom) splits are stored the same way -
    -- the backend just computes the equal amounts before inserting.
    CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_email TEXT NOT NULL,
      share_amount DOUBLE PRECISION NOT NULL
    );

    -- A direct payment recorded between two members to settle a balance.
    -- Adjusts balances without being a shared expense.
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// Runs a set of queries as a single atomic transaction. Pass a function
// that receives a client and awaits client.query(...) calls on it.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema, withTransaction };
