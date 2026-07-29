const Database = require("better-sqlite3");
const path = require("path");

// Single file on disk - no external database service, no cost.
const db = new Database(path.join(__dirname, "splittify.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- Registered users. A member's email in a group only lets them see/act
  -- in that group once they've signed up and logged in with that email.
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: add `name` to users if this is an existing database from
// before names were tracked.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("name")) {
  db.exec("ALTER TABLE users ADD COLUMN name TEXT");
}

db.exec(`

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: add `is_direct` to groups if this is an existing database.
// A "direct" group is an auto-created, hidden 1:1 pairing used to track
// personal expenses between two people outside of any named group.
const groupColumns = db.prepare("PRAGMA table_info(groups)").all().map((c) => c.name);
if (!groupColumns.includes("is_direct")) {
  db.exec("ALTER TABLE groups ADD COLUMN is_direct INTEGER NOT NULL DEFAULT 0");
}

db.exec(`
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
    amount REAL NOT NULL,
    paid_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per member per expense: how much of that expense they owe.
  -- Equal splits and unequal (custom) splits are stored the same way -
  -- the backend just computes the equal amounts before inserting.
  CREATE TABLE IF NOT EXISTS expense_splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    share_amount REAL NOT NULL
  );

  -- A direct payment recorded between two members to settle a balance
  -- (e.g. "Rahul paid You ₹150 in cash"). Adjusts balances without being
  -- a shared expense.
  CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
