import React, { useState, useEffect, useCallback } from "react";

// Change this if your backend runs somewhere other than localhost:4000.
// This app runs in your browser, so it can reach a backend running
// on your own machine at localhost as long as the server is up.
const API_BASE = "https://splittify.onrender.com";

// ---------- Design tokens ----------
// Ink        #0B0B0D  background
// Surface    #18181C  card surface
// Chalk      #F5F3EE  primary text
// Volt       #D4FF3D  primary neopop accent
// Mint       #39FF88  positive balance (owed to you)
// Coral      #FF5470  negative balance (you owe)

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');

  .tly-root {
    --ink: #0B0B0D;
    --surface: #18181C;
    --chalk: #F5F3EE;
    --volt: #D4FF3D;
    --mint: #39FF88;
    --coral: #FF5470;
    font-family: 'Inter', sans-serif;
    background: var(--ink);
    color: var(--chalk);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 32px 16px;
    box-sizing: border-box;
  }
  .tly-root * { box-sizing: border-box; }

  .tly-frame {
    width: 100%;
    max-width: 420px;
  }

  .tly-brand {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 28px;
    letter-spacing: -0.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .tly-brand span.dot { color: var(--volt); }

  .tly-hard {
    border: 2.5px solid #000;
    background: var(--surface);
    box-shadow: 6px 6px 0px #000;
  }

  .tly-card {
    padding: 18px 18px;
    margin-bottom: 16px;
    cursor: pointer;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .tly-card:active {
    transform: translate(6px, 6px);
    box-shadow: 0px 0px 0px #000;
  }

  .tly-card-title {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.2px;
    margin-bottom: 6px;
  }
  .tly-card-sub {
    font-size: 13px;
    color: #9A9A9E;
    font-family: 'JetBrains Mono', monospace;
  }
  .tly-card-balance {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 13px;
    margin-top: 6px;
  }
  .tly-card-balance.mint { color: var(--mint); }
  .tly-card-balance.coral { color: var(--coral); }
  .tly-card-balance.flat { color: #7A7A7E; }

  .tly-btn {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border: 2.5px solid #000;
    background: var(--volt);
    color: #0B0B0D;
    padding: 14px 20px;
    width: 100%;
    cursor: pointer;
    box-shadow: 5px 5px 0px #000;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .tly-btn:active {
    transform: translate(5px, 5px);
    box-shadow: 0px 0px 0px #000;
  }
  .tly-btn.ghost {
    background: var(--surface);
    color: var(--chalk);
  }
  .tly-btn.small {
    width: auto;
    padding: 10px 16px;
    font-size: 12px;
  }
  .tly-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tly-fab-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 32px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 40;
  }
  .tly-fab-bar-inner {
    width: 100%;
    max-width: 420px;
    position: relative;
    padding: 0 16px;
    box-sizing: border-box;
  }
  .tly-fab {
    position: absolute;
    bottom: 0;
    right: 16px;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 22px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2.5px solid #000;
    background: var(--volt);
    color: #0B0B0D;
    box-shadow: 5px 5px 0px #000;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    pointer-events: auto;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .tly-fab:active {
    transform: translate(5px, 5px);
    box-shadow: 0px 0px 0px #000;
  }
  .tly-fab:disabled { opacity: 0.4; cursor: not-allowed; }
  .tly-fab svg { display: block; }
  .tly-fab-group {
    background: var(--surface);
    color: var(--volt);
  }
  .tly-fab-personal {
    right: 82px;
    background: var(--volt);
    color: #0B0B0D;
  }

  .tly-back {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--chalk);
    background: none;
    border: none;
    cursor: pointer;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
  }

  .tly-group-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .tly-delete-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--coral);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 0;
  }

  .tly-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9A9A9E;
    margin-bottom: 8px;
    display: block;
  }

  .tly-input {
    width: 100%;
    background: var(--surface);
    border: 2.5px solid #000;
    color: var(--chalk);
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    padding: 12px 14px;
    margin-bottom: 16px;
    outline: none;
  }
  .tly-input.mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    font-weight: 700;
  }
  .tly-input:focus {
    border-color: var(--volt);
  }

  .tly-chiprow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .tly-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    border: 2px solid #000;
    background: var(--surface);
    color: var(--chalk);
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tly-chip.active {
    background: var(--volt);
    color: #0B0B0D;
  }
  .tly-chip .rm {
    font-weight: 700;
    opacity: 0.6;
  }

  .tly-balance-strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }
  .tly-balance-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 2.5px solid #000;
    background: var(--surface);
    padding: 12px 14px;
  }
  .tly-balance-name {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 14px;
  }
  .tly-balance-amt {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 14px;
    padding: 4px 10px;
    border: 2px solid #000;
  }
  .tly-balance-amt.mint { background: var(--mint); color: #0B0B0D; }
  .tly-balance-amt.coral { background: var(--coral); color: #0B0B0D; }
  .tly-balance-amt.flat { background: #333; color: var(--chalk); }

  .tly-action-row {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
  }

  .tly-add-member-row {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
  }
  .tly-add-member-row .tly-input {
    margin-bottom: 0;
  }

  .tly-section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    letter-spacing: 1.5px;
    color: #9A9A9E;
    margin: 24px 0 10px;
  }

  .tly-expense-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 2px solid #000;
    background: var(--surface);
    padding: 12px 14px;
    margin-bottom: 10px;
    gap: 10px;
  }
  .tly-expense-row.settlement {
    border-style: dashed;
    background: #141417;
  }
  .tly-expense-desc {
    font-size: 14px;
    font-weight: 500;
  }
  .tly-expense-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #9A9A9E;
    margin-top: 3px;
  }
  .tly-expense-amt-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .tly-expense-amt {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 15px;
  }
  .tly-row-actions {
    display: flex;
    gap: 6px;
  }
  .tly-icon-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    border: 2px solid #000;
    background: var(--ink);
    color: var(--chalk);
    padding: 3px 7px;
    cursor: pointer;
    line-height: 1.4;
  }
  .tly-icon-btn:hover { background: #26262a; }
  .tly-icon-btn.coral { color: var(--coral); }

  .tly-empty {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #7A7A7E;
    border: 2px dashed #444;
    padding: 24px;
    text-align: center;
    margin-bottom: 10px;
  }

  .tly-status {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #9A9A9E;
    padding: 20px 0;
    text-align: center;
  }

  .tly-error-banner {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    background: var(--coral);
    color: #0B0B0D;
    border: 2.5px solid #000;
    padding: 12px 14px;
    margin-bottom: 16px;
  }

  .tly-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 50;
  }
  .tly-sheet {
    width: 100%;
    max-width: 420px;
    background: var(--ink);
    border: 2.5px solid #000;
    border-bottom: none;
    padding: 24px 20px 28px;
    max-height: 88vh;
    overflow-y: auto;
  }
  .tly-sheet-title {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 20px;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tly-sheet-close {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
    background: none;
    border: none;
    color: var(--chalk);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .tly-split-toggle {
    display: flex;
    border: 2.5px solid #000;
    margin-bottom: 16px;
  }
  .tly-toggle-btn {
    flex: 1;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    background: var(--surface);
    color: var(--chalk);
    border: none;
    padding: 11px 0;
    cursor: pointer;
  }
  .tly-toggle-btn + .tly-toggle-btn {
    border-left: 2.5px solid #000;
  }
  .tly-toggle-btn.active {
    background: var(--volt);
    color: #0B0B0D;
  }

  .tly-custom-shares {
    margin-bottom: 8px;
  }
  .tly-share-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .tly-share-name {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 600;
    font-size: 14px;
    flex: 1;
  }
  .tly-share-input {
    width: 110px;
    margin-bottom: 0;
    font-size: 15px;
    padding: 9px 10px;
  }
  .tly-share-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #9A9A9E;
    border-top: 2px dashed #333;
    padding-top: 12px;
    margin-top: 4px;
    margin-bottom: 16px;
  }

  @media (max-width: 380px) {
    .tly-root { padding: 20px 12px; }
    .tly-brand { font-size: 24px; }
    .tly-sheet { padding: 20px 14px 24px; }
    .tly-fab-bar-inner { padding: 0 12px; }
    .tly-fab { width: 50px; height: 50px; }
    .tly-fab-personal { right: 74px; }
    .tly-share-input { width: 90px; }
  }
`;

function fmt(n) {
  const abs = Math.abs(Math.round(n));
  return `₹${abs.toLocaleString("en-IN")}`;
}

function nameFor(group, email) {
  const m = group?.members?.find((mm) => mm.email === email);
  return m ? m.name || m.email : email;
}

function isUnequalSplit(exp) {
  if (!exp.splits || exp.splits.length === 0) return false;
  const equalShare = exp.amount / exp.splits.length;
  return exp.splits.some((s) => Math.abs(s.share_amount - equalShare) > 0.5);
}

// Splits `amt` equally across `emails`, distributing rounding remainder
// across the first few members so the total always matches exactly.
function buildEqualSplits(amt, emails) {
  const n = emails.length;
  const base = Math.floor((amt / n) * 100) / 100;
  const splits = emails.map((email) => ({ email, amount: base }));
  let remainderCents = Math.round((amt - base * n) * 100);
  let i = 0;
  while (remainderCents > 0 && i < splits.length) {
    splits[i].amount = Math.round((splits[i].amount + 0.01) * 100) / 100;
    remainderCents -= 1;
    i += 1;
  }
  return splits;
}

// ---------- API layer ----------

const TOKEN_KEY = "splittify_token";
const EMAIL_KEY = "splittify_email";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, email) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

async function apiRequest(path, options = {}) {
  let res;
  const token = getToken();
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...options,
    });
  } catch (err) {
    throw new Error("Can't reach the server. Make sure the backend is running on localhost:4000.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Something went wrong");
    error.status = res.status;
    throw error;
  }
  return data;
}

const api = {
  signup: (email, password, name) =>
    apiRequest("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email, password) =>
    apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => apiRequest("/auth/me"),
  listGroups: () => apiRequest("/groups"),
  createGroup: (name, members) =>
    apiRequest("/groups", { method: "POST", body: JSON.stringify({ name, members }) }),
  getGroup: (id) => apiRequest(`/groups/${id}`),
  deleteGroup: (id) => apiRequest(`/groups/${id}`, { method: "DELETE" }),
  addMember: (groupId, email) =>
    apiRequest(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ email }) }),
  addExpense: (groupId, payload) =>
    apiRequest(`/groups/${groupId}/expenses`, { method: "POST", body: JSON.stringify(payload) }),
  updateExpense: (groupId, expenseId, payload) =>
    apiRequest(`/groups/${groupId}/expenses/${expenseId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteExpense: (groupId, expenseId) =>
    apiRequest(`/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),
  addSettlement: (groupId, payload) =>
    apiRequest(`/groups/${groupId}/settlements`, { method: "POST", body: JSON.stringify(payload) }),
  deleteSettlement: (groupId, settlementId) =>
    apiRequest(`/groups/${groupId}/settlements/${settlementId}`, { method: "DELETE" }),
  listPeople: () => apiRequest("/people"),
  getPerson: (email) => apiRequest(`/people/${encodeURIComponent(email)}`),
  addQuickExpense: (payload) =>
    apiRequest("/quick-expenses", { method: "POST", body: JSON.stringify(payload) }),
  addPersonalSettlement: (email, payload) =>
    apiRequest(`/people/${encodeURIComponent(email)}/settlements`, { method: "POST", body: JSON.stringify(payload) }),
};

export default function ExpenseSplitterApp() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [userName, setUserName] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authNameInput, setAuthNameInput] = useState("");
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  const [screen, setScreen] = useState("home"); // home | create | group | addExpense | settle
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);

  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");

  // Home tab: groups vs friends
  const [homeTab, setHomeTab] = useState("groups"); // groups | friends
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friendSearch, setFriendSearch] = useState("");

  // friend detail (a specific person's pairwise activity)
  const [activeFriendEmail, setActiveFriendEmail] = useState(null);
  const [friendDetail, setFriendDetail] = useState(null);
  const [loadingFriendDetail, setLoadingFriendDetail] = useState(false);

  // add-quick-expense form (one-off expense with 1+ people, no named group)
  const [quickPeople, setQuickPeople] = useState([]); // [{ email, name }] - others, excluding self
  const [quickPersonEmail, setQuickPersonEmail] = useState("");
  const [contacts, setContacts] = useState([]); // known people (from Friends) for email autocomplete
  const [quickDesc, setQuickDesc] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickPaidBy, setQuickPaidBy] = useState(null); // an email
  const [quickSplit, setQuickSplit] = useState([]); // emails included in the split
  const [quickSplitMode, setQuickSplitMode] = useState("equal");
  const [quickCustomShares, setQuickCustomShares] = useState({});

  // settle-up-with-a-friend form
  const [friendSettleAmount, setFriendSettleAmount] = useState("");
  const [friendSettleDirection, setFriendSettleDirection] = useState("i_paid"); // i_paid | they_paid

  // create-group form state
  const [newGroupName, setNewGroupName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMembers, setNewMembers] = useState([]);

  // add-member-to-existing-group state
  const [groupMemberEmail, setGroupMemberEmail] = useState("");

  // add/edit-expense form state
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState(null);
  const [expSplit, setExpSplit] = useState([]);
  const [splitMode, setSplitMode] = useState("equal");
  const [customShares, setCustomShares] = useState({});

  // settle-up form state
  const [settleFrom, setSettleFrom] = useState(null);
  const [settleTo, setSettleTo] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");

  function handleAuthFailure() {
    clearSession();
    setUserEmail(null);
    setScreen("home");
  }

  const refreshGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError("");
    try {
      const data = await api.listGroups();
      setGroups(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const refreshFriends = useCallback(async () => {
    setLoadingFriends(true);
    setError("");
    try {
      const data = await api.listPeople();
      setFriends(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  // On first load, check for a stored session and verify it's still valid.
  useEffect(() => {
    async function checkSession() {
      if (!getToken()) {
        setCheckingSession(false);
        return;
      }
      try {
        const data = await api.me();
        setUserEmail(data.email);
        setUserName(data.name);
      } catch (err) {
        clearSession();
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (userEmail && screen === "home" && homeTab === "groups") refreshGroups();
  }, [userEmail, screen, homeTab, refreshGroups]);

  useEffect(() => {
    if (userEmail && screen === "home" && homeTab === "friends") refreshFriends();
  }, [userEmail, screen, homeTab, refreshFriends]);

  async function openFriend(email) {
    setActiveFriendEmail(email);
    setScreen("friendDetail");
    setLoadingFriendDetail(true);
    setError("");
    try {
      const data = await api.getPerson(email);
      setFriendDetail(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setLoadingFriendDetail(false);
    }
  }

  async function refreshFriendDetail() {
    try {
      const data = await api.getPerson(activeFriendEmail);
      setFriendDetail(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    }
  }

  async function submitAuth() {
    const email = authEmailInput.trim().toLowerCase();
    if (!email.includes("@")) return setAuthError("Enter a valid email");
    if (authMode === "signup" && !authNameInput.trim()) return setAuthError("Enter your name");
    if (authPasswordInput.length < 6) return setAuthError("Password must be at least 6 characters");

    setAuthSubmitting(true);
    setAuthError("");
    try {
      const data =
        authMode === "signup"
          ? await api.signup(email, authPasswordInput, authNameInput.trim())
          : await api.login(email, authPasswordInput);
      setSession(data.token, data.email);
      setUserEmail(data.email);
      setUserName(data.name);
      setAuthPasswordInput("");
      setAuthNameInput("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  function logout() {
    clearSession();
    setUserEmail(null);
    setUserName(null);
    setGroups([]);
    setActiveGroup(null);
    setScreen("home");
  }

  async function openGroup(id) {
    setActiveGroupId(id);
    setScreen("group");
    setLoadingGroup(true);
    setError("");
    try {
      const data = await api.getGroup(id);
      setActiveGroup(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setLoadingGroup(false);
    }
  }

  async function refreshActiveGroup() {
    try {
      const data = await api.getGroup(activeGroupId);
      setActiveGroup(data);
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    }
  }

  // ---------- create group ----------

  function addNewMember() {
    const email = newMemberEmail.trim().toLowerCase();
    if (!email.includes("@") || email === userEmail || newMembers.length >= 7) return;
    if (newMembers.some((m) => m.email === email)) return;
    setNewMembers([...newMembers, { email, name: email.split("@")[0] }]);
    setNewMemberEmail("");
  }

  function removeNewMember(email) {
    setNewMembers(newMembers.filter((m) => m.email !== email));
  }

  async function createGroup() {
    if (!newGroupName.trim() || newMembers.length < 1) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createGroup(newGroupName.trim().toUpperCase(), newMembers);
      setNewGroupName("");
      setNewMembers([]);
      setNewMemberEmail("");
      setScreen("home");
      await refreshGroups();
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- group screen: members / delete ----------

  async function addMemberToActiveGroup() {
    const email = groupMemberEmail.trim().toLowerCase();
    if (!email.includes("@")) return;
    setSubmitting(true);
    setError("");
    try {
      await api.addMember(activeGroup.id, email);
      setGroupMemberEmail("");
      await refreshActiveGroup();
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteActiveGroup() {
    if (!window.confirm(`Delete "${activeGroup.name}" and all its expenses? This can't be undone.`)) return;
    setSubmitting(true);
    setError("");
    try {
      await api.deleteGroup(activeGroup.id);
      setScreen("home");
      setActiveGroup(null);
      await refreshGroups();
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- add / edit expense ----------

  function openAddExpense() {
    setEditingExpenseId(null);
    setExpDesc("");
    setExpAmount("");
    setExpPaidBy(activeGroup.members[0].email);
    setExpSplit(activeGroup.members.map((m) => m.email));
    setSplitMode("equal");
    setCustomShares({});
    setError("");
    setScreen("addExpense");
  }

  function openEditExpense(exp) {
    setEditingExpenseId(exp.id);
    setExpDesc(exp.description);
    setExpAmount(String(exp.amount));
    setExpPaidBy(exp.paidBy);
    const emails = exp.splits.map((s) => s.member_email);
    setExpSplit(emails);
    if (isUnequalSplit(exp)) {
      const shares = {};
      exp.splits.forEach((s) => (shares[s.member_email] = String(s.share_amount)));
      setCustomShares(shares);
      setSplitMode("custom");
    } else {
      setSplitMode("equal");
      setCustomShares({});
    }
    setError("");
    setScreen("addExpense");
  }

  async function deleteExpenseRow(expenseId) {
    if (!window.confirm("Delete this expense?")) return;
    setSubmitting(true);
    setError("");
    try {
      await api.deleteExpense(activeGroup.id, expenseId);
      await refreshActiveGroup();
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSplit(email) {
    setExpSplit((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  }

  function setCustomShare(email, value) {
    setCustomShares((prev) => ({ ...prev, [email]: value }));
  }

  function switchToCustom() {
    const amt = parseFloat(expAmount) || 0;
    const per = expSplit.length ? amt / expSplit.length : 0;
    const shares = {};
    expSplit.forEach((email) => (shares[email] = per ? per.toFixed(2) : ""));
    setCustomShares(shares);
    setSplitMode("custom");
  }

  const enteredTotal = expSplit.reduce((sum, email) => sum + (parseFloat(customShares[email]) || 0), 0);
  const expAmtNum = parseFloat(expAmount) || 0;
  const remaining = expAmtNum - enteredTotal;
  const sharesMatch = Math.abs(remaining) < 0.01;

  async function submitExpense() {
    const amt = parseFloat(expAmount);
    if (!expDesc.trim() || !amt || amt <= 0 || !expPaidBy || expSplit.length === 0) return;
    if (splitMode === "custom" && !sharesMatch) return;

    const splits =
      splitMode === "custom"
        ? expSplit.map((email) => ({ email, amount: parseFloat(customShares[email]) || 0 }))
        : buildEqualSplits(amt, expSplit);

    const payload = { description: expDesc.trim(), amount: amt, paidBy: expPaidBy, splits };

    setSubmitting(true);
    setError("");
    try {
      if (editingExpenseId) {
        await api.updateExpense(activeGroup.id, editingExpenseId, payload);
      } else {
        await api.addExpense(activeGroup.id, payload);
      }
      setEditingExpenseId(null);
      await refreshActiveGroup();
      setScreen("group");
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- settle up ----------

  function openSettleUp() {
    const balances = activeGroup.balances;
    const entries = Object.entries(balances);
    const debtor = entries.reduce((a, b) => (b[1] < a[1] ? b : a), entries[0]);
    const creditor = entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0]);
    setSettleFrom(debtor ? debtor[0] : activeGroup.members[0]?.email);
    setSettleTo(creditor ? creditor[0] : activeGroup.members[1]?.email);
    const suggested = Math.min(Math.abs(debtor?.[1] || 0), Math.abs(creditor?.[1] || 0));
    setSettleAmount(suggested > 0 ? suggested.toFixed(2) : "");
    setError("");
    setScreen("settle");
  }

  async function submitSettlement() {
    const amt = parseFloat(settleAmount);
    if (!settleFrom || !settleTo || settleFrom === settleTo || !amt || amt <= 0) return;
    setSubmitting(true);
    setError("");
    try {
      await api.addSettlement(activeGroup.id, { from: settleFrom, to: settleTo, amount: amt });
      await refreshActiveGroup();
      setScreen("group");
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSettlementRow(settlementId) {
    if (!window.confirm("Remove this settlement?")) return;
    setSubmitting(true);
    setError("");
    try {
      await api.deleteSettlement(activeGroup.id, settlementId);
      await refreshActiveGroup();
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- quick expense: one-off, with 1+ people, no named group ----------

  async function openAddPersonalExpense(preset) {
    const initialPeople = preset ? [{ email: preset.email, name: preset.name }] : [];
    setQuickPeople(initialPeople);
    setQuickPersonEmail("");
    setQuickDesc("");
    setQuickAmount("");
    setQuickPaidBy(userEmail);
    setQuickSplit([userEmail, ...initialPeople.map((p) => p.email)]);
    setQuickSplitMode("equal");
    setQuickCustomShares({});
    setError("");
    setScreen("addPersonalExpense");
    try {
      const data = await api.listPeople();
      setContacts(data);
    } catch (err) {
      // autocomplete suggestions are a nicety - fail silently if this doesn't load
    }
  }

  function addQuickPerson() {
    const email = quickPersonEmail.trim().toLowerCase();
    if (!email.includes("@") || email === userEmail || quickPeople.length >= 7) return;
    if (quickPeople.some((p) => p.email === email)) return;
    const known = contacts.find((c) => c.email === email);
    const person = { email, name: known?.name || email.split("@")[0] };
    setQuickPeople((prev) => [...prev, person]);
    setQuickSplit((prev) => [...prev, email]);
    setQuickPersonEmail("");
  }

  function removeQuickPerson(email) {
    setQuickPeople((prev) => prev.filter((p) => p.email !== email));
    setQuickSplit((prev) => prev.filter((e) => e !== email));
    if (quickPaidBy === email) setQuickPaidBy(userEmail);
  }

  function toggleQuickSplit(email) {
    setQuickSplit((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  }

  function switchQuickToCustom() {
    const amt = parseFloat(quickAmount) || 0;
    const per = quickSplit.length ? amt / quickSplit.length : 0;
    const shares = {};
    quickSplit.forEach((email) => (shares[email] = per ? per.toFixed(2) : ""));
    setQuickCustomShares(shares);
    setQuickSplitMode("custom");
  }

  const quickAmtNum = parseFloat(quickAmount) || 0;
  const quickEnteredTotal = quickSplit.reduce((sum, email) => sum + (parseFloat(quickCustomShares[email]) || 0), 0);
  const quickSharesMatch = Math.abs(quickAmtNum - quickEnteredTotal) < 0.01;

  function quickNameFor(email) {
    if (email === userEmail) return "You";
    const p = quickPeople.find((pp) => pp.email === email);
    return p?.name || email;
  }

  async function submitPersonalExpense() {
    const amt = parseFloat(quickAmount);
    if (quickPeople.length === 0 || !quickDesc.trim() || !amt || amt <= 0 || !quickPaidBy || quickSplit.length === 0) return;
    if (quickSplitMode === "custom" && !quickSharesMatch) return;

    const splits =
      quickSplitMode === "custom"
        ? quickSplit.map((email) => ({ email, amount: parseFloat(quickCustomShares[email]) || 0 }))
        : buildEqualSplits(amt, quickSplit);

    setSubmitting(true);
    setError("");
    try {
      await api.addQuickExpense({
        people: quickPeople,
        description: quickDesc.trim(),
        amount: amt,
        paidBy: quickPaidBy,
        splits,
      });
      if (homeTab === "friends") await refreshFriends();
      if (activeFriendEmail && quickPeople.some((p) => p.email === activeFriendEmail)) await refreshFriendDetail();
      setScreen(activeFriendEmail && quickPeople.length === 1 && quickPeople[0].email === activeFriendEmail ? "friendDetail" : "home");
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- settle up directly with a friend ----------

  function openFriendSettle() {
    setFriendSettleAmount(friendDetail?.balance ? Math.abs(friendDetail.balance).toFixed(2) : "");
    setFriendSettleDirection(friendDetail?.balance < 0 ? "i_paid" : "they_paid");
    setError("");
    setScreen("friendSettle");
  }

  async function submitFriendSettlement() {
    const amt = parseFloat(friendSettleAmount);
    if (!amt || amt <= 0) return;
    setSubmitting(true);
    setError("");
    try {
      await api.addPersonalSettlement(activeFriendEmail, { amount: amt, direction: friendSettleDirection });
      await refreshFriendDetail();
      setScreen("friendDetail");
    } catch (err) {
      if (err.status === 401) return handleAuthFailure();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="tly-root">
        <style>{STYLE}</style>
        <div className="tly-frame">
          <div className="tly-status">Checking session…</div>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="tly-root">
        <style>{STYLE}</style>
        <div className="tly-frame">
          <div className="tly-brand">
            SPLITTIFY<span className="dot">.</span>
          </div>
          {authError && <div className="tly-error-banner">{authError}</div>}
          <div className="tly-split-toggle">
            <button className={`tly-toggle-btn ${authMode === "login" ? "active" : ""}`} onClick={() => { setAuthMode("login"); setAuthError(""); }}>
              Log in
            </button>
            <button className={`tly-toggle-btn ${authMode === "signup" ? "active" : ""}`} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>
              Sign up
            </button>
          </div>
          {authMode === "signup" && (
            <>
              <span className="tly-label">Name</span>
              <input className="tly-input" placeholder="e.g. Dev" value={authNameInput} onChange={(e) => setAuthNameInput(e.target.value)} />
            </>
          )}
          <span className="tly-label">Email</span>
          <input className="tly-input" placeholder="name@email.com" value={authEmailInput} onChange={(e) => setAuthEmailInput(e.target.value)} />
          <span className="tly-label">Password</span>
          <input
            className="tly-input"
            type="password"
            placeholder={authMode === "signup" ? "At least 6 characters" : "••••••••"}
            value={authPasswordInput}
            onChange={(e) => setAuthPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAuth()}
          />
          <button className="tly-btn" disabled={authSubmitting} onClick={submitAuth}>
            {authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tly-root">
      <style>{STYLE}</style>
      <div className="tly-frame">
        {error && <div className="tly-error-banner">{error}</div>}

        {screen === "home" && (
          <>
            <div className="tly-brand">
              <span>SPLITTIFY<span className="dot">.</span></span>
              <button className="tly-delete-link" style={{ fontSize: 11 }} onClick={logout}>Log out</button>
            </div>
            <div className="tly-card-sub" style={{ marginTop: -14, marginBottom: 20 }}>{userName} · {userEmail}</div>

            <div className="tly-split-toggle">
              <button className={`tly-toggle-btn ${homeTab === "groups" ? "active" : ""}`} onClick={() => setHomeTab("groups")}>
                Groups
              </button>
              <button className={`tly-toggle-btn ${homeTab === "friends" ? "active" : ""}`} onClick={() => setHomeTab("friends")}>
                Friends
              </button>
            </div>

            {homeTab === "groups" && (
              <>
                {groups.length > 0 && (
                  <input
                    className="tly-input"
                    placeholder="Search groups…"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />
                )}
                {loadingGroups && <div className="tly-status">Loading groups…</div>}
                {!loadingGroups && groups.length === 0 && !error && (
                  <div className="tly-empty">No groups yet. Create one to start splitting.</div>
                )}
                {(() => {
                  const filtered = groups.filter((g) => g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
                  if (!loadingGroups && groups.length > 0 && filtered.length === 0) {
                    return <div className="tly-empty">No groups match "{groupSearch}".</div>;
                  }
                  return (
                    !loadingGroups &&
                    filtered.map((g) => (
                      <div key={g.id} className="tly-hard tly-card" onClick={() => openGroup(g.id)}>
                        <div className="tly-card-title">{g.name}</div>
                        <div className="tly-card-sub">{g.memberCount} members</div>
                        <div className={`tly-card-balance ${g.yourBalance > 1 ? "mint" : g.yourBalance < -1 ? "coral" : "flat"}`}>
                          {g.yourBalance > 1
                            ? `You're owed ${fmt(g.yourBalance)}`
                            : g.yourBalance < -1
                            ? `You owe ${fmt(g.yourBalance)}`
                            : "Settled up"}
                        </div>
                      </div>
                    ))
                  );
                })()}
              </>
            )}

            {homeTab === "friends" && (
              <>
                {friends.length > 0 && (
                  <input
                    className="tly-input"
                    placeholder="Search friends…"
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                  />
                )}
                {loadingFriends && <div className="tly-status">Loading friends…</div>}
                {!loadingFriends && friends.length === 0 && !error && (
                  <div className="tly-empty">No personal expenses or shared groups yet.</div>
                )}
                {(() => {
                  const filtered = friends.filter((f) => f.name.toLowerCase().includes(friendSearch.trim().toLowerCase()));
                  if (!loadingFriends && friends.length > 0 && filtered.length === 0) {
                    return <div className="tly-empty">No friends match "{friendSearch}".</div>;
                  }
                  return (
                    !loadingFriends &&
                    filtered.map((f) => (
                      <div key={f.email} className="tly-hard tly-card" onClick={() => openFriend(f.email)}>
                        <div className="tly-card-title">{f.name}</div>
                        <div className={`tly-card-balance ${f.balance > 1 ? "mint" : f.balance < -1 ? "coral" : "flat"}`}>
                          {f.balance > 1
                            ? `You're owed ${fmt(f.balance)}`
                            : f.balance < -1
                            ? `You owe ${fmt(f.balance)}`
                            : "Settled up"}
                        </div>
                      </div>
                    ))
                  );
                })()}
              </>
            )}

            <div style={{ height: 80 }} />
            <div className="tly-fab-bar">
              <div className="tly-fab-bar-inner">
                <button className="tly-fab tly-fab-personal" onClick={() => openAddPersonalExpense(null)} title="Add a personal expense">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button className="tly-fab tly-fab-group" onClick={() => setScreen("create")} title="Create a group">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
                    <circle cx="9" cy="8" r="3" />
                    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.36" />
                    <path d="M14.5 4.6a3.5 3.5 0 0 1 0 6.8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {screen === "create" && (
          <>
            <button className="tly-back" onClick={() => setScreen("home")}>← BACK</button>
            <div className="tly-brand" style={{ fontSize: 22 }}>New group</div>
            <span className="tly-label">Group name</span>
            <input className="tly-input" placeholder="e.g. Manali Trip" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            <span className="tly-label">You'll be added automatically</span>
            <div className="tly-chiprow">
              <div className="tly-chip active">{userName} (you)</div>
            </div>
            <span className="tly-label">Add other members by email (up to 7 more)</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                className="tly-input"
                style={{ marginBottom: 0 }}
                placeholder="name@email.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNewMember()}
              />
              <button className="tly-btn ghost small" onClick={addNewMember}>Add</button>
            </div>
            <div className="tly-chiprow">
              {newMembers.map((m) => (
                <div key={m.email} className="tly-chip active">
                  {m.name || m.email}
                  <span className="rm" onClick={() => removeNewMember(m.email)}>✕</span>
                </div>
              ))}
            </div>
            <button className="tly-btn" disabled={!newGroupName.trim() || newMembers.length < 1 || submitting} onClick={createGroup}>
              {submitting ? "Creating…" : "Create group"}
            </button>
          </>
        )}

        {screen === "group" && (
          <>
            <button className="tly-back" onClick={() => setScreen("home")}>← BACK</button>
            {loadingGroup && <div className="tly-status">Loading group…</div>}
            {!loadingGroup && activeGroup && (
              <>
                <div className="tly-group-header-row">
                  <div className="tly-brand" style={{ fontSize: 22, marginBottom: 0 }}>{activeGroup.name}</div>
                  <button className="tly-delete-link" onClick={deleteActiveGroup}>Delete group</button>
                </div>

                <div className="tly-balance-strip">
                  {Object.entries(activeGroup.balances).map(([email, amt]) => {
                    const cls = amt > 1 ? "mint" : amt < -1 ? "coral" : "flat";
                    const sign = amt > 1 ? "+ " : amt < -1 ? "− " : "";
                    return (
                      <div className="tly-balance-row" key={email}>
                        <div className="tly-balance-name">{nameFor(activeGroup, email)}</div>
                        <div className={`tly-balance-amt ${cls}`}>{sign}{fmt(amt)}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="tly-action-row">
                  <button className="tly-btn ghost" onClick={openSettleUp}>Settle up</button>
                </div>

                <span className="tly-label" style={{ marginTop: 8 }}>Add member</span>
                <div className="tly-add-member-row">
                  <input
                    className="tly-input"
                    placeholder="name@email.com"
                    value={groupMemberEmail}
                    onChange={(e) => setGroupMemberEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMemberToActiveGroup()}
                    disabled={activeGroup.members.length >= 8}
                  />
                  <button
                    className="tly-btn ghost small"
                    onClick={addMemberToActiveGroup}
                    disabled={activeGroup.members.length >= 8 || submitting}
                  >
                    Add
                  </button>
                </div>
                {activeGroup.members.length >= 8 && (
                  <div className="tly-card-sub" style={{ marginTop: -14, marginBottom: 20 }}>Group is full (8 members max)</div>
                )}

                <div className="tly-section-label">ACTIVITY</div>
                {activeGroup.activity.length === 0 && <div className="tly-empty">Nothing yet. Add the first expense.</div>}
                {activeGroup.activity.map((item) =>
                  item.kind === "expense" ? (
                    <div className="tly-expense-row" key={item.id}>
                      <div>
                        <div className="tly-expense-desc">{item.description}</div>
                        <div className="tly-expense-meta">
                          Paid by {nameFor(activeGroup, item.paidBy)} · split {item.splits.length}{isUnequalSplit(item) ? " · unequal" : ""}
                        </div>
                      </div>
                      <div className="tly-expense-amt-col">
                        <div className="tly-expense-amt">{fmt(item.amount)}</div>
                        <div className="tly-row-actions">
                          <button className="tly-icon-btn" onClick={() => openEditExpense(item)}>Edit</button>
                          <button className="tly-icon-btn coral" onClick={() => deleteExpenseRow(item.id)}>Del</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="tly-expense-row settlement" key={item.id}>
                      <div>
                        <div className="tly-expense-desc">Settled up</div>
                        <div className="tly-expense-meta">
                          {nameFor(activeGroup, item.from)} paid {nameFor(activeGroup, item.to)}
                        </div>
                      </div>
                      <div className="tly-expense-amt-col">
                        <div className="tly-expense-amt">{fmt(item.amount)}</div>
                        <div className="tly-row-actions">
                          <button className="tly-icon-btn coral" onClick={() => deleteSettlementRow(item.id)}>Del</button>
                        </div>
                      </div>
                    </div>
                  )
                )}

                <div style={{ height: 80 }} />
                <div className="tly-fab-bar">
                  <div className="tly-fab-bar-inner">
                    <button className="tly-fab" onClick={openAddExpense}>+</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {screen === "addExpense" && activeGroup && (
          <div className="tly-overlay">
            <div className="tly-sheet">
              <div className="tly-sheet-title">
                {editingExpenseId ? "Edit expense" : "Add expense"}
                <button className="tly-sheet-close" onClick={() => { setEditingExpenseId(null); setScreen("group"); }}>✕</button>
              </div>
              <span className="tly-label">Description</span>
              <input className="tly-input" placeholder="e.g. Dinner at cafe" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
              <span className="tly-label">Amount</span>
              <input className="tly-input mono" placeholder="0" type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
              <span className="tly-label">Paid by</span>
              <div className="tly-chiprow">
                {activeGroup.members.map((m) => (
                  <div key={m.email} className={`tly-chip ${expPaidBy === m.email ? "active" : ""}`} onClick={() => setExpPaidBy(m.email)}>
                    {m.name || m.email}
                  </div>
                ))}
              </div>
              <span className="tly-label">Split between</span>
              <div className="tly-chiprow">
                {activeGroup.members.map((m) => (
                  <div key={m.email} className={`tly-chip ${expSplit.includes(m.email) ? "active" : ""}`} onClick={() => toggleSplit(m.email)}>
                    {m.name || m.email}
                  </div>
                ))}
              </div>

              <span className="tly-label">How to split</span>
              <div className="tly-split-toggle">
                <button className={`tly-toggle-btn ${splitMode === "equal" ? "active" : ""}`} onClick={() => setSplitMode("equal")}>
                  Equally
                </button>
                <button className={`tly-toggle-btn ${splitMode === "custom" ? "active" : ""}`} onClick={switchToCustom}>
                  Unequally
                </button>
              </div>

              {splitMode === "custom" && (
                <div className="tly-custom-shares">
                  {expSplit.map((email) => (
                    <div key={email} className="tly-share-row">
                      <div className="tly-share-name">{nameFor(activeGroup, email)}</div>
                      <input
                        className="tly-input mono tly-share-input"
                        type="number"
                        placeholder="0"
                        value={customShares[email] ?? ""}
                        onChange={(e) => setCustomShare(email, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="tly-share-total-row">
                    <span>Entered {fmt(enteredTotal)} of {fmt(expAmtNum)}</span>
                    <span className={`tly-balance-amt ${sharesMatch ? "mint" : "coral"}`}>
                      {sharesMatch ? "✓ matches" : `${remaining > 0 ? "short " : "over "}${fmt(Math.abs(remaining))}`}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="tly-btn ghost" onClick={() => { setEditingExpenseId(null); setScreen("group"); }}>Cancel</button>
                <button
                  className="tly-btn"
                  disabled={(splitMode === "custom" && !sharesMatch) || submitting}
                  onClick={submitExpense}
                >
                  {submitting ? "Saving…" : editingExpenseId ? "Save changes" : "Add expense"}
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "settle" && activeGroup && (
          <div className="tly-overlay">
            <div className="tly-sheet">
              <div className="tly-sheet-title">
                Settle up
                <button className="tly-sheet-close" onClick={() => setScreen("group")}>✕</button>
              </div>
              <span className="tly-label">Who paid</span>
              <div className="tly-chiprow">
                {activeGroup.members.map((m) => (
                  <div key={m.email} className={`tly-chip ${settleFrom === m.email ? "active" : ""}`} onClick={() => setSettleFrom(m.email)}>
                    {m.name || m.email}
                  </div>
                ))}
              </div>
              <span className="tly-label">Who received it</span>
              <div className="tly-chiprow">
                {activeGroup.members.map((m) => (
                  <div key={m.email} className={`tly-chip ${settleTo === m.email ? "active" : ""}`} onClick={() => setSettleTo(m.email)}>
                    {m.name || m.email}
                  </div>
                ))}
              </div>
              <span className="tly-label">Amount</span>
              <input className="tly-input mono" placeholder="0" type="number" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} />

              {settleFrom && settleTo && settleFrom === settleTo && (
                <div className="tly-card-sub" style={{ marginTop: -8, marginBottom: 16 }}>Pick two different people</div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="tly-btn ghost" onClick={() => setScreen("group")}>Cancel</button>
                <button
                  className="tly-btn"
                  disabled={!settleFrom || !settleTo || settleFrom === settleTo || !parseFloat(settleAmount) || submitting}
                  onClick={submitSettlement}
                >
                  {submitting ? "Saving…" : "Record settlement"}
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "friendDetail" && (
          <>
            <button className="tly-back" onClick={() => setScreen("home")}>← BACK</button>
            {loadingFriendDetail && <div className="tly-status">Loading…</div>}
            {!loadingFriendDetail && friendDetail && (
              <>
                <div className="tly-brand" style={{ fontSize: 22 }}>{friendDetail.name}</div>
                <div className="tly-balance-strip">
                  <div className="tly-balance-row">
                    <div className="tly-balance-name">Overall</div>
                    <div className={`tly-balance-amt ${friendDetail.balance > 1 ? "mint" : friendDetail.balance < -1 ? "coral" : "flat"}`}>
                      {friendDetail.balance > 1 ? "+ " : friendDetail.balance < -1 ? "− " : ""}
                      {fmt(friendDetail.balance)}
                    </div>
                  </div>
                </div>

                <div className="tly-action-row">
                  <button className="tly-btn ghost" onClick={openFriendSettle}>Settle up</button>
                </div>

                <div className="tly-section-label">ACTIVITY</div>
                {friendDetail.activity.length === 0 && <div className="tly-empty">Nothing yet. Add the first expense.</div>}
                {friendDetail.activity.map((item) => (
                  <div className={`tly-expense-row ${item.kind === "settlement" ? "settlement" : ""}`} key={item.id}>
                    <div>
                      <div className="tly-expense-desc">{item.kind === "expense" ? item.description : "Settled up"}</div>
                      <div className="tly-expense-meta">
                        {item.kind === "expense"
                          ? `Paid by ${item.paidBy === userEmail ? "you" : friendDetail.name}${item.groupName ? ` · ${item.groupName}` : " · Personal"}`
                          : `${item.from === userEmail ? "You" : friendDetail.name} paid ${item.to === userEmail ? "you" : friendDetail.name}${item.groupName ? ` · ${item.groupName}` : " · Personal"}`}
                      </div>
                    </div>
                    <div className={`tly-expense-amt`} style={{ color: item.effect > 0 ? "var(--mint)" : item.effect < 0 ? "var(--coral)" : undefined }}>
                      {item.effect > 0 ? "+ " : item.effect < 0 ? "− " : ""}
                      {fmt(item.amount)}
                    </div>
                  </div>
                ))}

                <div style={{ height: 80 }} />
                <div className="tly-fab-bar">
                  <div className="tly-fab-bar-inner">
                    <button className="tly-fab" onClick={() => openAddPersonalExpense({ email: activeFriendEmail, name: friendDetail.name })}>+</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {screen === "addPersonalExpense" && (
          <div className="tly-overlay">
            <div className="tly-sheet">
              <div className="tly-sheet-title">
                Add quick expense
                <button
                  className="tly-sheet-close"
                  onClick={() => setScreen(activeFriendEmail && quickPeople.length === 1 && quickPeople[0].email === activeFriendEmail ? "friendDetail" : "home")}
                >
                  ✕
                </button>
              </div>

              <span className="tly-label">Who's this with? (add 1 or more)</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  className="tly-input"
                  style={{ marginBottom: 0 }}
                  placeholder="name@email.com"
                  list="quick-contacts"
                  value={quickPersonEmail}
                  onChange={(e) => setQuickPersonEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQuickPerson()}
                />
                <datalist id="quick-contacts">
                  {contacts.map((c) => (
                    <option key={c.email} value={c.email} label={c.name} />
                  ))}
                </datalist>
                <button className="tly-btn ghost small" onClick={addQuickPerson} disabled={quickPeople.length >= 7}>
                  Add
                </button>
              </div>
              <div className="tly-chiprow">
                <div className="tly-chip active">You</div>
                {quickPeople.map((p) => (
                  <div key={p.email} className="tly-chip active">
                    {p.name}
                    <span className="rm" onClick={() => removeQuickPerson(p.email)}>✕</span>
                  </div>
                ))}
              </div>
              {quickPeople.length >= 7 && (
                <div className="tly-card-sub" style={{ marginTop: -12, marginBottom: 16 }}>Max 8 people per expense</div>
              )}

              <span className="tly-label">Description</span>
              <input className="tly-input" placeholder="e.g. Pizza night" value={quickDesc} onChange={(e) => setQuickDesc(e.target.value)} />
              <span className="tly-label">Amount</span>
              <input className="tly-input mono" placeholder="0" type="number" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} />

              <span className="tly-label">Paid by</span>
              <div className="tly-chiprow">
                <div className={`tly-chip ${quickPaidBy === userEmail ? "active" : ""}`} onClick={() => setQuickPaidBy(userEmail)}>You</div>
                {quickPeople.map((p) => (
                  <div key={p.email} className={`tly-chip ${quickPaidBy === p.email ? "active" : ""}`} onClick={() => setQuickPaidBy(p.email)}>
                    {p.name}
                  </div>
                ))}
              </div>

              <span className="tly-label">Split between</span>
              <div className="tly-chiprow">
                <div className={`tly-chip ${quickSplit.includes(userEmail) ? "active" : ""}`} onClick={() => toggleQuickSplit(userEmail)}>You</div>
                {quickPeople.map((p) => (
                  <div key={p.email} className={`tly-chip ${quickSplit.includes(p.email) ? "active" : ""}`} onClick={() => toggleQuickSplit(p.email)}>
                    {p.name}
                  </div>
                ))}
              </div>

              <span className="tly-label">How to split</span>
              <div className="tly-split-toggle">
                <button className={`tly-toggle-btn ${quickSplitMode === "equal" ? "active" : ""}`} onClick={() => setQuickSplitMode("equal")}>
                  Equally
                </button>
                <button className={`tly-toggle-btn ${quickSplitMode === "custom" ? "active" : ""}`} onClick={switchQuickToCustom}>
                  Unequally
                </button>
              </div>

              {quickSplitMode === "custom" && (
                <div className="tly-custom-shares">
                  {quickSplit.map((email) => (
                    <div key={email} className="tly-share-row">
                      <div className="tly-share-name">{quickNameFor(email)}</div>
                      <input
                        className="tly-input mono tly-share-input"
                        type="number"
                        placeholder="0"
                        value={quickCustomShares[email] ?? ""}
                        onChange={(e) => setQuickCustomShares((prev) => ({ ...prev, [email]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="tly-share-total-row">
                    <span>Entered {fmt(quickEnteredTotal)} of {fmt(quickAmtNum)}</span>
                    <span className={`tly-balance-amt ${quickSharesMatch ? "mint" : "coral"}`}>
                      {quickSharesMatch ? "✓ matches" : "doesn't match"}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  className="tly-btn ghost"
                  onClick={() => setScreen(activeFriendEmail && quickPeople.length === 1 && quickPeople[0].email === activeFriendEmail ? "friendDetail" : "home")}
                >
                  Cancel
                </button>
                <button
                  className="tly-btn"
                  disabled={
                    submitting ||
                    quickPeople.length === 0 ||
                    !quickDesc.trim() ||
                    !parseFloat(quickAmount) ||
                    !quickPaidBy ||
                    quickSplit.length === 0 ||
                    (quickSplitMode === "custom" && !quickSharesMatch)
                  }
                  onClick={submitPersonalExpense}
                >
                  {submitting ? "Saving…" : "Add expense"}
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "friendSettle" && friendDetail && (
          <div className="tly-overlay">
            <div className="tly-sheet">
              <div className="tly-sheet-title">
                Settle up with {friendDetail.name}
                <button className="tly-sheet-close" onClick={() => setScreen("friendDetail")}>✕</button>
              </div>
              <span className="tly-label">Who paid</span>
              <div className="tly-chiprow">
                <div className={`tly-chip ${friendSettleDirection === "i_paid" ? "active" : ""}`} onClick={() => setFriendSettleDirection("i_paid")}>
                  You paid {friendDetail.name}
                </div>
                <div className={`tly-chip ${friendSettleDirection === "they_paid" ? "active" : ""}`} onClick={() => setFriendSettleDirection("they_paid")}>
                  {friendDetail.name} paid you
                </div>
              </div>
              <span className="tly-label">Amount</span>
              <input className="tly-input mono" placeholder="0" type="number" value={friendSettleAmount} onChange={(e) => setFriendSettleAmount(e.target.value)} />
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="tly-btn ghost" onClick={() => setScreen("friendDetail")}>Cancel</button>
                <button className="tly-btn" disabled={!parseFloat(friendSettleAmount) || submitting} onClick={submitFriendSettlement}>
                  {submitting ? "Saving…" : "Record settlement"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
