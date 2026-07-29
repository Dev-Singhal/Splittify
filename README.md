# Splittify — Expense Splitter

Backend (Express + SQLite) and frontend (React + Vite). No API keys, no external services — everything runs on your own machine. Members need a real account (name + email + password) to log in and access their groups.

## Step-by-step: run it

### 1. Check Node.js is installed
```
node -v
```

### 2. Start the backend
Open a terminal (plain Command Prompt on Windows, not PowerShell):
```
cd backend
npm install
node server.js
```
You should see:
```
Splittify backend running on http://localhost:4000
```
Leave this terminal open.

### 3. Start the frontend
Open a **second** terminal:
```
cd frontend
npm install
npm run dev
```
Open the printed URL (usually `http://localhost:5173`).

## Groups vs Friends vs Quick Expenses

Home has two tabs:
- **Groups** — named groups with 2+ members, expenses, settle-up.
- **Friends** — your net balance with each individual, aggregated across every shared group plus any quick (no-group) expenses.

Two round buttons sit at the bottom of Home: a grey one with a people icon (create a named group), and a neon-green one with a plus icon (**quick expense** — a one-off split with one or more people, no named group ever created). Adding a person just needs their email — autocomplete suggests names of people you've dealt with before.

Every popup form (Add Expense, Settle Up, Quick Expense) now has a **✕** button next to its title to back out without saving, in addition to the Cancel button at the bottom.

## Step-by-step: test it

1. **Sign up** — name, email, password (6+ characters).

2. **Try the ✕ close button** — open Add Expense (or Settle Up, or the quick-expense screen), tap the ✕ next to the title, confirm it takes you back without saving anything.

3. **Resize your browser window (or check on your phone)** — the two round Home buttons should stay properly aligned to the right edge of the content column at any window width, with icons centered inside them, not drifting off-screen on narrow widths.

4. **Add a quick expense with someone new** — tap the green button, type an email, add them, fill in the rest, submit. Check Friends — they should show up with a guessed name.

5. **Add a quick expense with someone you've dealt with before** — typing their email should suggest their real name via autocomplete.

6. **Add a quick expense with 3 people, then another with the same 3** — balances should combine (same hidden pairing reused). A different combination should NOT merge with it.

7. **Groups still work as before:** create a group, duplicate-name check, search, add/edit/delete expenses, settle up, delete a group, and the Home balance-refresh fix.

## Notes

- Data lives in `backend/splittify.db`. Delete it to reset everything (including accounts).
- Passwords are hashed (bcrypt); the login token is a JWT signed with a hardcoded dev secret in `server.js` (`JWT_SECRET`) — fine locally, change it before any public deployment.
- To point the frontend at a different backend address, edit `API_BASE` at the top of `frontend/src/App.jsx`.

## Deploying the frontend to GitHub Pages

This repo includes a GitHub Actions workflow (`.github/workflows/deploy-frontend.yml`) that automatically builds and publishes the frontend every time you push to `main`.

1. **Create the GitHub repo** named `splittify` (matches the path already configured in `vite.config.js`) and push this whole folder to it.
2. **Enable Pages:** on GitHub, go to your repo → **Settings** → **Pages** → under "Build and deployment", set **Source** to **GitHub Actions** (not "Deploy from a branch").
3. **Push to `main`** (or just push what you already have) — this triggers the workflow. Watch it run under the **Actions** tab.
4. Once it finishes, your frontend is live at:
   ```
   https://<your-github-username>.github.io/splittify/
   ```
5. **Every future push** to the `frontend/` folder automatically rebuilds and redeploys — no manual steps needed.

Right now, `API_BASE` in `frontend/src/App.jsx` still points at `http://localhost:4000`, so once live, the hosted frontend won't be able to reach a backend running only on your own machine. Once the backend is hosted somewhere reachable (next step), update `API_BASE` to that URL, commit, and push — the site redeploys automatically with the new address.

