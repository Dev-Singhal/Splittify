const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const uid = () => crypto.randomUUID();
const MAX_MEMBERS = 8;

// Only used to sign/verify our own login tokens - not a paid service, not
// sent anywhere. If you ever deploy this publicly, change it to a long
// random string kept outside source control.
const JWT_SECRET = "splittify-dev-secret-change-me-if-deploying";

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: "30d" });
}

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

function getGroupOr404(req, res) {
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  return group;
}

function getMembers(groupId) {
  // A signed-up user's account name always takes priority over whatever
  // name was set when they were first invited to the group - so if
  // someone signs up later with a real name, it shows everywhere.
  return db
    .prepare(
      `SELECT m.email, COALESCE(u.name, m.name) AS name
       FROM members m
       LEFT JOIN users u ON u.email = m.email
       WHERE m.group_id = ?`
    )
    .all(groupId);
}

function getUserName(email) {
  const user = db.prepare("SELECT name FROM users WHERE email = ?").get(email);
  return user?.name || null;
}

function isGroupMember(groupId, email) {
  return getMembers(groupId).some((m) => m.email === email);
}

// Finds the existing hidden group whose member set exactly matches
// {meEmail, ...others}, or creates one. Used for "quick expenses" recorded
// outside any named group - a one-off split with one or more people. Reused
// whenever the exact same set of people adds another quick expense together.
function getOrCreateQuickGroup(meEmail, others) {
  const allEmails = [meEmail, ...others.map((o) => o.email)];
  const n = allEmails.length;

  const placeholders = allEmails.map(() => "?").join(",");
  const candidates = db
    .prepare(
      `SELECT group_id, COUNT(*) as matched FROM members
       WHERE group_id IN (SELECT id FROM groups WHERE is_direct = 1)
       AND email IN (${placeholders})
       GROUP BY group_id
       HAVING matched = ?`
    )
    .all(...allEmails, n);

  for (const cand of candidates) {
    const total = db.prepare("SELECT COUNT(*) as cnt FROM members WHERE group_id = ?").get(cand.group_id).cnt;
    if (total === n) return cand.group_id; // exact set match, no extra members
  }

  const groupId = uid();
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO groups (id, name, is_direct) VALUES (?, ?, 1)").run(groupId, "Quick expense");
    db.prepare("INSERT INTO members (id, group_id, email, name) VALUES (?, ?, ?, ?)").run(
      uid(),
      groupId,
      meEmail,
      getUserName(meEmail) || "You"
    );
    others.forEach((o) => {
      db.prepare("INSERT INTO members (id, group_id, email, name) VALUES (?, ?, ?, ?)").run(
        uid(),
        groupId,
        o.email,
        o.name || getUserName(o.email) || o.email.split("@")[0]
      );
    });
  });
  tx();
  return groupId;
}

function getExpensesWithSplits(groupId) {
  const expenses = db
    .prepare("SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC")
    .all(groupId);
  const splitStmt = db.prepare("SELECT member_email, share_amount FROM expense_splits WHERE expense_id = ?");
  return expenses.map((exp) => ({
    id: exp.id,
    description: exp.description,
    amount: exp.amount,
    paidBy: exp.paid_by,
    createdAt: exp.created_at,
    splits: splitStmt.all(exp.id),
  }));
}

function getSettlements(groupId) {
  return db
    .prepare("SELECT id, from_email, to_email, amount, created_at FROM settlements WHERE group_id = ? ORDER BY created_at DESC")
    .all(groupId);
}

function getActivity(groupId) {
  const expenses = getExpensesWithSplits(groupId).map((e) => ({ kind: "expense", ...e }));
  const settlements = getSettlements(groupId).map((s) => ({
    kind: "settlement",
    id: s.id,
    from: s.from_email,
    to: s.to_email,
    amount: s.amount,
    createdAt: s.created_at,
  }));
  return [...expenses, ...settlements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function computeBalances(groupId) {
  const members = getMembers(groupId);
  const balances = {};
  members.forEach((m) => (balances[m.email] = 0));

  const expenses = db.prepare("SELECT id, amount, paid_by FROM expenses WHERE group_id = ?").all(groupId);
  const splitStmt = db.prepare("SELECT member_email, share_amount FROM expense_splits WHERE expense_id = ?");
  expenses.forEach((exp) => {
    if (balances[exp.paid_by] !== undefined) balances[exp.paid_by] += exp.amount;
    splitStmt.all(exp.id).forEach((s) => {
      if (balances[s.member_email] !== undefined) balances[s.member_email] -= s.share_amount;
    });
  });

  const settlements = db.prepare("SELECT from_email, to_email, amount FROM settlements WHERE group_id = ?").all(groupId);
  settlements.forEach((s) => {
    if (balances[s.from_email] !== undefined) balances[s.from_email] += s.amount;
    if (balances[s.to_email] !== undefined) balances[s.to_email] -= s.amount;
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

// ---------- auth ----------

// POST /auth/signup  { email, password, name }
app.post("/auth/signup", (req, res) => {
  const { email, password, name } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();
  const trimmedName = (name || "").trim();

  if (!normalizedEmail.includes("@")) return res.status(400).json({ error: "A valid email is required" });
  if (!trimmedName) return res.status(400).json({ error: "A name is required" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) return res.status(400).json({ error: "That email is already registered - try logging in instead" });

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)").run(
    uid(),
    normalizedEmail,
    passwordHash,
    trimmedName
  );

  res.status(201).json({ token: signToken(normalizedEmail), email: normalizedEmail, name: trimmedName });
});

// POST /auth/login  { email, password }
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  res.json({ token: signToken(normalizedEmail), email: normalizedEmail, name: user.name });
});

// GET /auth/me - confirms a stored token is still valid, used on app load
app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ email: req.userEmail, name: getUserName(req.userEmail) });
});

// Everything below requires a logged-in user.
app.use(requireAuth);

// ---------- groups ----------

// POST /groups  { name, members: [{ email, name }] }
// The logged-in user is always included as a member automatically.
app.post("/groups", (req, res) => {
  const { name, members } = req.body;
  const you = req.userEmail;

  if (!name || !name.trim()) return res.status(400).json({ error: "Group name is required" });
  if (!Array.isArray(members)) return res.status(400).json({ error: "members must be a list" });

  const duplicate = db
    .prepare(
      `SELECT g.id FROM groups g
       JOIN members m ON m.group_id = g.id
       WHERE m.email = ? AND LOWER(g.name) = LOWER(?)`
    )
    .get(you, name.trim());
  if (duplicate) return res.status(400).json({ error: `You already have a group named "${name.trim()}"` });

  const provided = members.map((m) => ({
    email: (m.email || "").trim().toLowerCase(),
    name: m.name || null,
  }));
  const hasYou = provided.some((m) => m.email === you);
  const finalMembers = hasYou ? provided : [{ email: you, name: getUserName(you) || "You" }, ...provided];

  if (finalMembers.length < 2) return res.status(400).json({ error: "A group needs at least 2 members" });
  if (finalMembers.length > MAX_MEMBERS)
    return res.status(400).json({ error: `A group can have at most ${MAX_MEMBERS} members` });

  const emails = finalMembers.map((m) => m.email);
  if (emails.some((e) => !e.includes("@"))) return res.status(400).json({ error: "Every member needs a valid email" });
  if (new Set(emails).size !== emails.length) return res.status(400).json({ error: "Duplicate member emails" });

  const groupId = uid();
  const insertGroup = db.prepare("INSERT INTO groups (id, name) VALUES (?, ?)");
  const insertMember = db.prepare("INSERT INTO members (id, group_id, email, name) VALUES (?, ?, ?, ?)");

  const tx = db.transaction(() => {
    insertGroup.run(groupId, name.trim());
    finalMembers.forEach((m) => insertMember.run(uid(), groupId, m.email, m.name));
  });
  tx();

  res.status(201).json({ id: groupId, name: name.trim(), members: getMembers(groupId) });
});

// GET /groups - only groups the logged-in user actually belongs to
app.get("/groups", (req, res) => {
  const groups = db.prepare("SELECT id, name, created_at, is_direct FROM groups ORDER BY created_at DESC").all();
  const result = groups
    .filter((g) => !g.is_direct && isGroupMember(g.id, req.userEmail))
    .map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.created_at,
      memberCount: getMembers(g.id).length,
      yourBalance: computeBalances(g.id)[req.userEmail] ?? 0,
    }));
  res.json(result);
});

// Everything from here on operates on a specific group - require the
// logged-in user to actually be a member of it.
function requireGroupMember(req, res, next) {
  const group = getGroupOr404(req, res);
  if (!group) return;
  if (!isGroupMember(group.id, req.userEmail)) {
    return res.status(403).json({ error: "You're not a member of this group" });
  }
  req.group = group;
  next();
}

// GET /groups/:groupId - full detail: members, activity feed, balances
app.get("/groups/:groupId", requireGroupMember, (req, res) => {
  const group = req.group;
  res.json({
    id: group.id,
    name: group.name,
    createdAt: group.created_at,
    members: getMembers(group.id),
    activity: getActivity(group.id),
    balances: computeBalances(group.id),
  });
});

// DELETE /groups/:groupId
app.delete("/groups/:groupId", requireGroupMember, (req, res) => {
  db.prepare("DELETE FROM groups WHERE id = ?").run(req.group.id); // cascades everything
  res.json({ success: true });
});

// ---------- members ----------

// POST /groups/:groupId/members  { email, name }
app.post("/groups/:groupId/members", requireGroupMember, (req, res) => {
  const group = req.group;
  const { email, name } = req.body;
  if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required" });

  const current = getMembers(group.id);
  if (current.length >= MAX_MEMBERS) return res.status(400).json({ error: `Group already has ${MAX_MEMBERS} members` });
  if (current.some((m) => m.email === email.trim().toLowerCase()))
    return res.status(400).json({ error: "Member already in group" });

  db.prepare("INSERT INTO members (id, group_id, email, name) VALUES (?, ?, ?, ?)").run(
    uid(),
    group.id,
    email.trim().toLowerCase(),
    name || null
  );

  res.status(201).json({ members: getMembers(group.id) });
});

// ---------- expenses ----------

// POST /groups/:groupId/expenses  { description, amount, paidBy, splits }
// Shared by POST /groups/:groupId/expenses and POST /people/:email/expenses -
// both ultimately create an expense inside some group (a named one, or a
// hidden 1:1 "direct" one for personal expenses).
function createExpenseInGroup(groupId, body) {
  const { description, amount, paidBy, splits } = body;
  const memberEmails = new Set(getMembers(groupId).map((m) => m.email));

  if (!description || !description.trim()) return { error: "Description is required" };
  if (typeof amount !== "number" || amount <= 0) return { error: "Amount must be a positive number" };
  if (!paidBy || !memberEmails.has(paidBy)) return { error: "paidBy must be a member of this group" };

  const splitError = validateSplits(splits, amount, memberEmails);
  if (splitError) return { error: splitError };

  const expenseId = uid();
  const insertExpense = db.prepare(
    "INSERT INTO expenses (id, group_id, description, amount, paid_by) VALUES (?, ?, ?, ?, ?)"
  );
  const insertSplit = db.prepare(
    "INSERT INTO expense_splits (id, expense_id, member_email, share_amount) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    insertExpense.run(expenseId, groupId, description.trim(), amount, paidBy);
    splits.forEach((s) => insertSplit.run(uid(), expenseId, s.email, s.amount));
  });
  tx();

  return { success: true };
}

app.post("/groups/:groupId/expenses", requireGroupMember, (req, res) => {
  const result = createExpenseInGroup(req.group.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result);
});

// PUT /groups/:groupId/expenses/:expenseId
app.put("/groups/:groupId/expenses/:expenseId", requireGroupMember, (req, res) => {
  const group = req.group;
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ? AND group_id = ?").get(req.params.expenseId, group.id);
  if (!exp) return res.status(404).json({ error: "Expense not found" });

  const { description, amount, paidBy, splits } = req.body;
  const memberEmails = new Set(getMembers(group.id).map((m) => m.email));

  if (!description || !description.trim()) return res.status(400).json({ error: "Description is required" });
  if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });
  if (!paidBy || !memberEmails.has(paidBy)) return res.status(400).json({ error: "paidBy must be a member of this group" });

  const splitError = validateSplits(splits, amount, memberEmails);
  if (splitError) return res.status(400).json({ error: splitError });

  const tx = db.transaction(() => {
    db.prepare("UPDATE expenses SET description = ?, amount = ?, paid_by = ? WHERE id = ?").run(
      description.trim(),
      amount,
      paidBy,
      exp.id
    );
    db.prepare("DELETE FROM expense_splits WHERE expense_id = ?").run(exp.id);
    const insertSplit = db.prepare(
      "INSERT INTO expense_splits (id, expense_id, member_email, share_amount) VALUES (?, ?, ?, ?)"
    );
    splits.forEach((s) => insertSplit.run(uid(), exp.id, s.email, s.amount));
  });
  tx();

  res.json({ success: true });
});

// DELETE /groups/:groupId/expenses/:expenseId
app.delete("/groups/:groupId/expenses/:expenseId", requireGroupMember, (req, res) => {
  const exp = db.prepare("SELECT id FROM expenses WHERE id = ? AND group_id = ?").get(req.params.expenseId, req.group.id);
  if (!exp) return res.status(404).json({ error: "Expense not found" });
  db.prepare("DELETE FROM expenses WHERE id = ?").run(exp.id);
  res.json({ success: true });
});

// ---------- settlements ----------

// POST /groups/:groupId/settlements  { from, to, amount }
app.post("/groups/:groupId/settlements", requireGroupMember, (req, res) => {
  const group = req.group;
  const { from, to, amount } = req.body;
  const memberEmails = new Set(getMembers(group.id).map((m) => m.email));

  if (!from || !memberEmails.has(from)) return res.status(400).json({ error: "from must be a member of this group" });
  if (!to || !memberEmails.has(to)) return res.status(400).json({ error: "to must be a member of this group" });
  if (from === to) return res.status(400).json({ error: "from and to must be different members" });
  if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

  db.prepare("INSERT INTO settlements (id, group_id, from_email, to_email, amount) VALUES (?, ?, ?, ?, ?)").run(
    uid(),
    group.id,
    from,
    to,
    amount
  );

  res.status(201).json({ success: true });
});

// DELETE /groups/:groupId/settlements/:settlementId
app.delete("/groups/:groupId/settlements/:settlementId", requireGroupMember, (req, res) => {
  const settlement = db
    .prepare("SELECT id FROM settlements WHERE id = ? AND group_id = ?")
    .get(req.params.settlementId, req.group.id);
  if (!settlement) return res.status(404).json({ error: "Settlement not found" });
  db.prepare("DELETE FROM settlements WHERE id = ?").run(settlement.id);
  res.json({ success: true });
});

// ---------- people (friends) ----------
// A "friend" is anyone you share at least one group with (regular or a
// hidden 1:1 personal one). Balances here are computed pairwise: for each
// shared group, an expense only affects a pair's balance if one of the two
// paid and the other is in the split - a third party's payment doesn't
// directly change what you and this specific person owe each other.

function pairwiseEffect(paidBy, splitMap, me, other) {
  if (paidBy === me && splitMap[other] !== undefined) return splitMap[other]; // they owe me their share
  if (paidBy === other && splitMap[me] !== undefined) return -splitMap[me]; // I owe them my share
  return 0;
}

// GET /people - everyone you share a group with, and your net balance with each
app.get("/people", (req, res) => {
  const me = req.userEmail;
  const myGroupIds = db.prepare("SELECT group_id FROM members WHERE email = ?").all(me).map((r) => r.group_id);

  const peopleMap = {};
  myGroupIds.forEach((groupId) => {
    const others = getMembers(groupId).filter((m) => m.email !== me);
    if (others.length === 0) return;

    const expenses = db.prepare("SELECT id, amount, paid_by FROM expenses WHERE group_id = ?").all(groupId);
    const splitStmt = db.prepare("SELECT member_email, share_amount FROM expense_splits WHERE expense_id = ?");
    const settlements = db.prepare("SELECT from_email, to_email, amount FROM settlements WHERE group_id = ?").all(groupId);

    others.forEach((other) => {
      if (!peopleMap[other.email]) peopleMap[other.email] = { email: other.email, name: other.name, balance: 0 };
      else peopleMap[other.email].name = other.name; // prefer latest known name

      expenses.forEach((exp) => {
        const splitMap = {};
        splitStmt.all(exp.id).forEach((s) => (splitMap[s.member_email] = s.share_amount));
        peopleMap[other.email].balance += pairwiseEffect(exp.paid_by, splitMap, me, other.email);
      });

      settlements.forEach((s) => {
        if (s.from_email === me && s.to_email === other.email) peopleMap[other.email].balance += s.amount;
        if (s.from_email === other.email && s.to_email === me) peopleMap[other.email].balance -= s.amount;
      });
    });
  });

  const result = Object.values(peopleMap).sort((a, b) => a.name.localeCompare(b.name));
  res.json(result);
});

// GET /people/:email - merged pairwise activity feed with one specific person
app.get("/people/:email", (req, res) => {
  const me = req.userEmail;
  const other = req.params.email.toLowerCase();

  const myGroupIds = db.prepare("SELECT group_id FROM members WHERE email = ?").all(me).map((r) => r.group_id);
  const sharedGroupIds = myGroupIds.filter((gid) => isGroupMember(gid, other));

  if (sharedGroupIds.length === 0) {
    return res.json({ email: other, name: getUserName(other) || other.split("@")[0], balance: 0, activity: [] });
  }

  let items = [];
  let balance = 0;
  let name = other.split("@")[0];

  sharedGroupIds.forEach((groupId) => {
    const group = db.prepare("SELECT id, name, is_direct FROM groups WHERE id = ?").get(groupId);
    const members = getMembers(groupId);
    const otherMember = members.find((m) => m.email === other);
    if (otherMember) name = otherMember.name || name;

    const expenses = getExpensesWithSplits(groupId);
    expenses.forEach((exp) => {
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
    });

    getSettlements(groupId).forEach((s) => {
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
  });

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ email: other, name: getUserName(other) || name, balance, activity: items });
});

// POST /quick-expenses - add a one-off expense with one or more people,
// outside of any named group. Creates (or reuses) a hidden group matching
// the exact set of participants.
// Body: { people: [{ email, name }], description, amount, paidBy, splits }
app.post("/quick-expenses", (req, res) => {
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

  const groupId = getOrCreateQuickGroup(me, normalizedPeople);
  const result = createExpenseInGroup(groupId, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ ...result, groupId });
});

// POST /people/:email/settlements - settle up directly with one individual
app.post("/people/:email/settlements", (req, res) => {
  const me = req.userEmail;
  const other = (req.params.email || "").trim().toLowerCase();
  const { amount, direction } = req.body; // direction: "i_paid" | "they_paid"

  if (!other.includes("@")) return res.status(400).json({ error: "A valid email is required" });
  if (other === me) return res.status(400).json({ error: "Can't settle up with yourself" });
  if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

  const groupId = getOrCreateQuickGroup(me, [{ email: other, name: req.body.name }]);
  const from = direction === "they_paid" ? other : me;
  const to = direction === "they_paid" ? me : other;

  db.prepare("INSERT INTO settlements (id, group_id, from_email, to_email, amount) VALUES (?, ?, ?, ?, ?)").run(
    uid(),
    groupId,
    from,
    to,
    amount
  );

  res.status(201).json({ success: true, groupId });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Splittify backend running on http://localhost:${PORT}`));
