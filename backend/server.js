require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, initSchema, withTransaction } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const uid = () => crypto.randomUUID();
const MAX_MEMBERS = 8;

// Only used to sign/verify our own login tokens - not a paid service, not
// sent anywhere. If you deploy this publicly, set a real JWT_SECRET env
// var to a long random string instead of relying on this fallback.
const JWT_SECRET = process.env.JWT_SECRET || "splittify-dev-secret-change-me-if-deploying";

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: "30d" });
}

// Wraps an async route/middleware so a rejected promise reaches Express's
// error handler instead of hanging the request or crashing the process.
const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---------- auth middleware ----------

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userEmail = payload.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

// ---------- helpers ----------

async function getGroupOr404(req, res) {
  const { rows } = await pool.query("SELECT * FROM groups WHERE id = $1", [req.params.groupId]);
  const group = rows[0];
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  return group;
}

async function getMembers(groupId) {
  const { rows } = await pool.query(
    `SELECT m.email, COALESCE(u.name, m.name) AS name
     FROM members m
     LEFT JOIN users u ON u.email = m.email
     WHERE m.group_id = $1`,
    [groupId]
  );
  return rows;
}

async function getUserName(email) {
  const { rows } = await pool.query("SELECT name FROM users WHERE email = $1", [email]);
  return rows[0]?.name || null;
}

async function isGroupMember(groupId, email) {
  const members = await getMembers(groupId);
  return members.some((m) => m.email === email);
}

// Finds the existing hidden group whose member set exactly matches
// {meEmail, ...others}, or creates one. Used for "quick expenses" recorded
// outside any named group - a one-off split with one or more people. Reused
// whenever the exact same set of people adds another quick expense together.
async function getOrCreateQuickGroup(meEmail, others) {
  const allEmails = [meEmail, ...others.map((o) => o.email)];
  const n = allEmails.length;

  const placeholders = allEmails.map((_, i) => `$${i + 1}`).join(",");
  const { rows: candidates } = await pool.query(
    `SELECT group_id, COUNT(*) as matched FROM members
     WHERE group_id IN (SELECT id FROM groups WHERE is_direct = 1)
     AND email IN (${placeholders})
     GROUP BY group_id
     HAVING COUNT(*) = $${n + 1}`,
    [...allEmails, n]
  );

  for (const cand of candidates) {
    const { rows: totalRows } = await pool.query("SELECT COUNT(*) as cnt FROM members WHERE group_id = $1", [cand.group_id]);
    if (Number(totalRows[0].cnt) === n) return cand.group_id; // exact set match, no extra members
  }

  const groupId = uid();
  const meName = (await getUserName(meEmail)) || "You";
  await withTransaction(async (client) => {
    await client.query("INSERT INTO groups (id, name, is_direct) VALUES ($1, $2, 1)", [groupId, "Quick expense"]);
    await client.query("INSERT INTO members (id, group_id, email, name) VALUES ($1, $2, $3, $4)", [
      uid(),
      groupId,
      meEmail,
      meName,
    ]);
    for (const o of others) {
      const name = o.name || (await getUserName(o.email)) || o.email.split("@")[0];
      await client.query("INSERT INTO members (id, group_id, email, name) VALUES ($1, $2, $3, $4)", [
        uid(),
        groupId,
        o.email,
        name,
      ]);
    }
  });
  return groupId;
}

async function getExpensesWithSplits(groupId) {
  const { rows: expenses } = await pool.query(
    "SELECT * FROM expenses WHERE group_id = $1 ORDER BY created_at DESC",
    [groupId]
  );
  const result = [];
  for (const exp of expenses) {
    const { rows: splits } = await pool.query(
      "SELECT member_email, share_amount FROM expense_splits WHERE expense_id = $1",
      [exp.id]
    );
    result.push({
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      paidBy: exp.paid_by,
      createdAt: exp.created_at,
      splits: splits.map((s) => ({ member_email: s.member_email, share_amount: Number(s.share_amount) })),
    });
  }
  return result;
}

async function getSettlements(groupId) {
  const { rows } = await pool.query(
    "SELECT id, from_email, to_email, amount, created_at FROM settlements WHERE group_id = $1 ORDER BY created_at DESC",
    [groupId]
  );
  return rows.map((s) => ({ ...s, amount: Number(s.amount) }));
}

// Merged, time-ordered feed of expenses + settlements for the group screen.
async function getActivity(groupId) {
  const expenses = (await getExpensesWithSplits(groupId)).map((e) => ({ kind: "expense", ...e }));
  const settlements = (await getSettlements(groupId)).map((s) => ({
    kind: "settlement",
    id: s.id,
    from: s.from_email,
    to: s.to_email,
    amount: s.amount,
    createdAt: s.created_at,
  }));
  return [...expenses, ...settlements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function computeBalances(groupId) {
  const members = await getMembers(groupId);
  const balances = {};
  members.forEach((m) => (balances[m.email] = 0));

  const { rows: expenses } = await pool.query("SELECT id, amount, paid_by FROM expenses WHERE group_id = $1", [groupId]);
  for (const exp of expenses) {
    if (balances[exp.paid_by] !== undefined) balances[exp.paid_by] += Number(exp.amount);
    const { rows: splits } = await pool.query(
      "SELECT member_email, share_amount FROM expense_splits WHERE expense_id = $1",
      [exp.id]
    );
    splits.forEach((s) => {
      if (balances[s.member_email] !== undefined) balances[s.member_email] -= Number(s.share_amount);
    });
  }

  // A settlement moves balance from the payer toward zero, and from the
  // receiver toward zero, by the settled amount.
  const { rows: settlements } = await pool.query("SELECT from_email, to_email, amount FROM settlements WHERE group_id = $1", [groupId]);
  settlements.forEach((s) => {
    if (balances[s.from_email] !== undefined) balances[s.from_email] += Number(s.amount);
    if (balances[s.to_email] !== undefined) balances[s.to_email] -= Number(s.amount);
  });

  return balances;
}

function validateSplits(splits, amount, memberEmails) {
  if (!Array.isArray(splits) || splits.length === 0) return "At least one split is required";
  for (const s of splits) {
    if (!memberEmails.has(s.email)) return `${s.email} is not a member of this group`;
    if (typeof s.amount !== "number" || s.amount < 0) return "Each split amount must be a non-negative number";
  }
  const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(splitTotal - amount) > 0.01) return `Split amounts (${splitTotal}) must add up to the total (${amount})`;
  return null;
}

// Shared by POST /groups/:groupId/expenses and POST /quick-expenses - both
// ultimately create an expense inside some group (a named one, or a hidden
// 1-or-more-person "direct" one for quick expenses).
async function createExpenseInGroup(groupId, body) {
  const { description, amount, paidBy, splits } = body;
  const memberEmails = new Set((await getMembers(groupId)).map((m) => m.email));

  if (!description || !description.trim()) return { error: "Description is required" };
  if (typeof amount !== "number" || amount <= 0) return { error: "Amount must be a positive number" };
  if (!paidBy || !memberEmails.has(paidBy)) return { error: "paidBy must be a member of this group" };

  const splitError = validateSplits(splits, amount, memberEmails);
  if (splitError) return { error: splitError };

  const expenseId = uid();
  await withTransaction(async (client) => {
    await client.query(
      "INSERT INTO expenses (id, group_id, description, amount, paid_by) VALUES ($1, $2, $3, $4, $5)",
      [expenseId, groupId, description.trim(), amount, paidBy]
    );
    for (const s of splits) {
      await client.query(
        "INSERT INTO expense_splits (id, expense_id, member_email, share_amount) VALUES ($1, $2, $3, $4)",
        [uid(), expenseId, s.email, s.amount]
      );
    }
  });

  return { success: true };
}

// ---------- auth ----------

app.post(
  "/auth/signup",
  asyncRoute(async (req, res) => {
    const { email, password, name } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const trimmedName = (name || "").trim();

    if (!normalizedEmail.includes("@")) return res.status(400).json({ error: "A valid email is required" });
    if (!trimmedName) return res.status(400).json({ error: "A name is required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length > 0) return res.status(400).json({ error: "That email is already registered - try logging in instead" });

    const passwordHash = bcrypt.hashSync(password, 10);
    await pool.query("INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)", [
      uid(),
      normalizedEmail,
      passwordHash,
      trimmedName,
    ]);

    res.status(201).json({ token: signToken(normalizedEmail), email: normalizedEmail, name: trimmedName });
  })
);

app.post(
  "/auth/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    res.json({ token: signToken(normalizedEmail), email: normalizedEmail, name: user.name });
  })
);

app.get(
  "/auth/me",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ email: req.userEmail, name: await getUserName(req.userEmail) });
  })
);

// Everything below requires a logged-in user.
app.use(requireAuth);

// ---------- groups ----------

app.post(
  "/groups",
  asyncRoute(async (req, res) => {
    const { name, members } = req.body;
    const you = req.userEmail;

    if (!name || !name.trim()) return res.status(400).json({ error: "Group name is required" });
    if (!Array.isArray(members)) return res.status(400).json({ error: "members must be a list" });

    const provided = members.map((m) => ({
      email: (m.email || "").trim().toLowerCase(),
      name: m.name || null,
    }));
    const hasYou = provided.some((m) => m.email === you);
    const finalMembers = hasYou ? provided : [{ email: you, name: (await getUserName(you)) || "You" }, ...provided];

    if (finalMembers.length < 2) return res.status(400).json({ error: "A group needs at least 2 members" });
    if (finalMembers.length > MAX_MEMBERS)
      return res.status(400).json({ error: `A group can have at most ${MAX_MEMBERS} members` });

    const emails = finalMembers.map((m) => m.email);
    if (emails.some((e) => !e.includes("@"))) return res.status(400).json({ error: "Every member needs a valid email" });
    if (new Set(emails).size !== emails.length) return res.status(400).json({ error: "Duplicate member emails" });

    const duplicate = await pool.query(
      `SELECT g.id FROM groups g
       JOIN members m ON m.group_id = g.id
       WHERE m.email = $1 AND LOWER(g.name) = LOWER($2)`,
      [you, name.trim()]
    );
    if (duplicate.rows.length > 0) return res.status(400).json({ error: `You already have a group named "${name.trim()}"` });

    const groupId = uid();
    await withTransaction(async (client) => {
      await client.query("INSERT INTO groups (id, name) VALUES ($1, $2)", [groupId, name.trim()]);
      for (const m of finalMembers) {
        await client.query("INSERT INTO members (id, group_id, email, name) VALUES ($1, $2, $3, $4)", [
          uid(),
          groupId,
          m.email,
          m.name,
        ]);
      }
    });

    res.status(201).json({ id: groupId, name: name.trim(), members: await getMembers(groupId) });
  })
);

app.get(
  "/groups",
  asyncRoute(async (req, res) => {
    const { rows: groups } = await pool.query("SELECT id, name, created_at, is_direct FROM groups ORDER BY created_at DESC");
    const result = [];
    for (const g of groups) {
      if (g.is_direct) continue;
      if (!(await isGroupMember(g.id, req.userEmail))) continue;
      const members = await getMembers(g.id);
      const balances = await computeBalances(g.id);
      result.push({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
        memberCount: members.length,
        yourBalance: balances[req.userEmail] ?? 0,
      });
    }
    res.json(result);
  })
);

function requireGroupMember(req, res, next) {
  (async () => {
    const group = await getGroupOr404(req, res);
    if (!group) return;
    if (!(await isGroupMember(group.id, req.userEmail))) {
      return res.status(403).json({ error: "You're not a member of this group" });
    }
    req.group = group;
    next();
  })().catch(next);
}

app.get(
  "/groups/:groupId",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const group = req.group;
    res.json({
      id: group.id,
      name: group.name,
      createdAt: group.created_at,
      members: await getMembers(group.id),
      activity: await getActivity(group.id),
      balances: await computeBalances(group.id),
    });
  })
);

app.delete(
  "/groups/:groupId",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    await pool.query("DELETE FROM groups WHERE id = $1", [req.group.id]); // cascades everything
    res.json({ success: true });
  })
);

// ---------- members ----------

app.post(
  "/groups/:groupId/members",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const group = req.group;
    const { email, name } = req.body;
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required" });

    const current = await getMembers(group.id);
    if (current.length >= MAX_MEMBERS) return res.status(400).json({ error: `Group already has ${MAX_MEMBERS} members` });
    if (current.some((m) => m.email === email.trim().toLowerCase()))
      return res.status(400).json({ error: "Member already in group" });

    await pool.query("INSERT INTO members (id, group_id, email, name) VALUES ($1, $2, $3, $4)", [
      uid(),
      group.id,
      email.trim().toLowerCase(),
      name || null,
    ]);

    res.status(201).json({ members: await getMembers(group.id) });
  })
);

// ---------- expenses ----------

app.post(
  "/groups/:groupId/expenses",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const result = await createExpenseInGroup(req.group.id, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  })
);

app.put(
  "/groups/:groupId/expenses/:expenseId",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const group = req.group;
    const { rows } = await pool.query("SELECT * FROM expenses WHERE id = $1 AND group_id = $2", [req.params.expenseId, group.id]);
    const exp = rows[0];
    if (!exp) return res.status(404).json({ error: "Expense not found" });

    const { description, amount, paidBy, splits } = req.body;
    const memberEmails = new Set((await getMembers(group.id)).map((m) => m.email));

    if (!description || !description.trim()) return res.status(400).json({ error: "Description is required" });
    if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });
    if (!paidBy || !memberEmails.has(paidBy)) return res.status(400).json({ error: "paidBy must be a member of this group" });

    const splitError = validateSplits(splits, amount, memberEmails);
    if (splitError) return res.status(400).json({ error: splitError });

    await withTransaction(async (client) => {
      await client.query("UPDATE expenses SET description = $1, amount = $2, paid_by = $3 WHERE id = $4", [
        description.trim(),
        amount,
        paidBy,
        exp.id,
      ]);
      await client.query("DELETE FROM expense_splits WHERE expense_id = $1", [exp.id]);
      for (const s of splits) {
        await client.query(
          "INSERT INTO expense_splits (id, expense_id, member_email, share_amount) VALUES ($1, $2, $3, $4)",
          [uid(), exp.id, s.email, s.amount]
        );
      }
    });

    res.json({ success: true });
  })
);

app.delete(
  "/groups/:groupId/expenses/:expenseId",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const { rows } = await pool.query("SELECT id FROM expenses WHERE id = $1 AND group_id = $2", [req.params.expenseId, req.group.id]);
    if (!rows[0]) return res.status(404).json({ error: "Expense not found" });
    await pool.query("DELETE FROM expenses WHERE id = $1", [rows[0].id]);
    res.json({ success: true });
  })
);

// ---------- settlements ----------

app.post(
  "/groups/:groupId/settlements",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const group = req.group;
    const { from, to, amount } = req.body;
    const memberEmails = new Set((await getMembers(group.id)).map((m) => m.email));

    if (!from || !memberEmails.has(from)) return res.status(400).json({ error: "from must be a member of this group" });
    if (!to || !memberEmails.has(to)) return res.status(400).json({ error: "to must be a member of this group" });
    if (from === to) return res.status(400).json({ error: "from and to must be different members" });
    if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

    await pool.query("INSERT INTO settlements (id, group_id, from_email, to_email, amount) VALUES ($1, $2, $3, $4, $5)", [
      uid(),
      group.id,
      from,
      to,
      amount,
    ]);

    res.status(201).json({ success: true });
  })
);

app.delete(
  "/groups/:groupId/settlements/:settlementId",
  requireGroupMember,
  asyncRoute(async (req, res) => {
    const { rows } = await pool.query("SELECT id FROM settlements WHERE id = $1 AND group_id = $2", [
      req.params.settlementId,
      req.group.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Settlement not found" });
    await pool.query("DELETE FROM settlements WHERE id = $1", [rows[0].id]);
    res.json({ success: true });
  })
);

// ---------- people (friends) ----------
// A "friend" is anyone you share at least one group with (regular or a
// hidden quick-expense one). Balances are computed pairwise: for each
// shared group, an expense only affects a pair's balance if one of the two
// paid and the other is in the split - a third party's payment doesn't
// directly change what you and this specific person owe each other.

function pairwiseEffect(paidBy, splitMap, me, other) {
  if (paidBy === me && splitMap[other] !== undefined) return splitMap[other]; // they owe me their share
  if (paidBy === other && splitMap[me] !== undefined) return -splitMap[me]; // I owe them my share
  return 0;
}

app.get(
  "/people",
  asyncRoute(async (req, res) => {
    const me = req.userEmail;
    const { rows: myGroupRows } = await pool.query("SELECT group_id FROM members WHERE email = $1", [me]);
    const myGroupIds = myGroupRows.map((r) => r.group_id);

    const peopleMap = {};
    for (const groupId of myGroupIds) {
      const others = (await getMembers(groupId)).filter((m) => m.email !== me);
      if (others.length === 0) continue;

      const { rows: expenses } = await pool.query("SELECT id, amount, paid_by FROM expenses WHERE group_id = $1", [groupId]);
      const { rows: settlements } = await pool.query("SELECT from_email, to_email, amount FROM settlements WHERE group_id = $1", [groupId]);

      for (const other of others) {
        if (!peopleMap[other.email]) peopleMap[other.email] = { email: other.email, name: other.name, balance: 0 };
        else peopleMap[other.email].name = other.name; // prefer latest known name

        for (const exp of expenses) {
          const { rows: splitRows } = await pool.query("SELECT member_email, share_amount FROM expense_splits WHERE expense_id = $1", [exp.id]);
          const splitMap = {};
          splitRows.forEach((s) => (splitMap[s.member_email] = Number(s.share_amount)));
          peopleMap[other.email].balance += pairwiseEffect(exp.paid_by, splitMap, me, other.email);
        }

        settlements.forEach((s) => {
          if (s.from_email === me && s.to_email === other.email) peopleMap[other.email].balance += Number(s.amount);
          if (s.from_email === other.email && s.to_email === me) peopleMap[other.email].balance -= Number(s.amount);
        });
      }
    }

    const result = Object.values(peopleMap).sort((a, b) => a.name.localeCompare(b.name));
    res.json(result);
  })
);

app.get(
  "/people/:email",
  asyncRoute(async (req, res) => {
    const me = req.userEmail;
    const other = req.params.email.toLowerCase();

    const { rows: myGroupRows } = await pool.query("SELECT group_id FROM members WHERE email = $1", [me]);
    const myGroupIds = myGroupRows.map((r) => r.group_id);

    const sharedGroupIds = [];
    for (const gid of myGroupIds) {
      if (await isGroupMember(gid, other)) sharedGroupIds.push(gid);
    }

    if (sharedGroupIds.length === 0) {
      return res.json({ email: other, name: (await getUserName(other)) || other.split("@")[0], balance: 0, activity: [] });
    }

    let items = [];
    let balance = 0;
    let name = other.split("@")[0];

    for (const groupId of sharedGroupIds) {
      const { rows: groupRows } = await pool.query("SELECT id, name, is_direct FROM groups WHERE id = $1", [groupId]);
      const group = groupRows[0];
      const members = await getMembers(groupId);
      const otherMember = members.find((m) => m.email === other);
      if (otherMember) name = otherMember.name || name;

      const expenses = await getExpensesWithSplits(groupId);
      for (const exp of expenses) {
        const splitMap = {};
        exp.splits.forEach((s) => (splitMap[s.member_email] = s.share_amount));
        const effect = pairwiseEffect(exp.paidBy, splitMap, me, other);
        if (effect !== 0) {
          balance += effect;
          items.push({
            kind: "expense",
            id: exp.id,
            description: exp.description,
            amount: exp.amount,
            paidBy: exp.paidBy,
            createdAt: exp.createdAt,
            effect,
            groupId: group.id,
            groupName: group.is_direct ? null : group.name,
          });
        }
      }

      const settlements = await getSettlements(groupId);
      settlements.forEach((s) => {
        const involves = (s.from_email === me && s.to_email === other) || (s.from_email === other && s.to_email === me);
        if (!involves) return;
        const effect = s.from_email === me ? s.amount : -s.amount;
        balance += effect;
        items.push({
          kind: "settlement",
          id: s.id,
          from: s.from_email,
          to: s.to_email,
          amount: s.amount,
          createdAt: s.created_at,
          effect,
          groupId,
          groupName: group.is_direct ? null : group.name,
        });
      });
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ email: other, name: (await getUserName(other)) || name, balance, activity: items });
  })
);

app.post(
  "/quick-expenses",
  asyncRoute(async (req, res) => {
    const me = req.userEmail;
    const { people } = req.body;

    if (!Array.isArray(people) || people.length === 0) {
      return res.status(400).json({ error: "Add at least one other person" });
    }
    if (people.length > MAX_MEMBERS - 1) {
      return res.status(400).json({ error: `A quick expense can include at most ${MAX_MEMBERS} people total` });
    }

    const normalizedPeople = people.map((p) => ({
      email: (p.email || "").trim().toLowerCase(),
      name: (p.name || "").trim() || undefined,
    }));

    if (normalizedPeople.some((p) => !p.email.includes("@"))) {
      return res.status(400).json({ error: "Every person needs a valid email" });
    }
    if (normalizedPeople.some((p) => p.email === me)) {
      return res.status(400).json({ error: "You're already included automatically" });
    }
    const emailSet = new Set(normalizedPeople.map((p) => p.email));
    if (emailSet.size !== normalizedPeople.length) {
      return res.status(400).json({ error: "Duplicate people in this expense" });
    }

    const groupId = await getOrCreateQuickGroup(me, normalizedPeople);
    const result = await createExpenseInGroup(groupId, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json({ ...result, groupId });
  })
);

app.post(
  "/people/:email/settlements",
  asyncRoute(async (req, res) => {
    const me = req.userEmail;
    const other = (req.params.email || "").trim().toLowerCase();
    const { amount, direction } = req.body; // direction: "i_paid" | "they_paid"

    if (!other.includes("@")) return res.status(400).json({ error: "A valid email is required" });
    if (other === me) return res.status(400).json({ error: "Can't settle up with yourself" });
    if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

    const groupId = await getOrCreateQuickGroup(me, [{ email: other, name: req.body.name }]);
    const from = direction === "they_paid" ? other : me;
    const to = direction === "they_paid" ? me : other;

    await pool.query("INSERT INTO settlements (id, group_id, from_email, to_email, amount) VALUES ($1, $2, $3, $4, $5)", [
      uid(),
      groupId,
      from,
      to,
      amount,
    ]);

    res.status(201).json({ success: true, groupId });
  })
);

// Generic error handler - catches anything asyncRoute passed to next().
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await initSchema();
  app.listen(PORT, () => console.log(`Splittify backend running on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
