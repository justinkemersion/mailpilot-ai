# MailPilot Web

Next.js dashboard for **MailPilot AI** — personal email automation with Gmail connect, AI classification, processing history, and undo.

## Architecture

The web app is the **control plane**. Classification and Gmail processing run in [`mailpilot-runner`](../mailpilot-runner). Data is stored in **Flux** (PostgREST `api` schema). App login uses **NextAuth**; Gmail mailbox OAuth is a separate flow at `/auth/google`.

See [root `README.md`](../README.md) and [`ARCHETECTURE.md`](./ARCHETECTURE.md).

## Dashboard routes

| Route | Purpose |
|-------|---------|
| `/dashboard/overview` | Metrics, classifier status, manual sync, accounts, recent activity |
| `/dashboard/accounts` | Connected Gmail accounts |
| `/dashboard/activity` | Full email history with search, filters, pagination |
| `/dashboard/settings` | Settings (stub) |

## Setup

1. **Environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in at least:

   - `AUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`
   - `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (and/or Google sign-in vars)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Gmail connect)
   - `NEXT_PUBLIC_FLUX_URL`, `FLUX_SERVICE_TOKEN`

2. **Install and dev**

   ```bash
   npm install
   npm run dev
   ```

3. **Runner** — Link Gmail in the UI, then run the worker:

   ```bash
   cd ../mailpilot-runner
   source .venv/bin/activate
   python -m mailpilot.main watch-jobs
   ```

   Use **Run sync** on the overview page to queue `run_jobs`.

## Demo mode

Visitors can explore MailPilot without OAuth or Gmail using a **cookie-scoped demo session** (fake user **Chris**, `demo@mailpilot.local`).

### Entry

- Login page: **Continue as Demo User**
- Direct URL: `/demo/enter` (alias: `/demo`)

### Environment

```bash
# Server authority — required in production to enable /demo/enter
ENABLE_DEMO_MODE=true

# UI hint only — shows login CTA; does NOT authorize demo entry
NEXT_PUBLIC_ENABLE_DEMO_MODE=true
```

**Defaults:** demo entry is **on** in `NODE_ENV=development` unless `ENABLE_DEMO_MODE=false`. In production, demo entry is **off** unless `ENABLE_DEMO_MODE=true`.

### Safety guarantees

Demo mode never:

- Starts Gmail OAuth or reads tokens
- Calls AI providers or enqueues real sync jobs
- Writes to Flux / production user data
- Exposes secrets, env vars, or provider diagnostics

Simulated UX: `/api/run` returns a fake successful sync; `/api/undo` returns a friendly simulated response. Account mutations and OAuth exchange remain blocked.

Sign out clears the demo cookie (`mailpilot_demo=1`).

### Operator / screenshot mode (legacy)

`MAILPILOT_DEMO_MODE=true` forces fixture data for **all** requests (including authenticated users). Use only for operator screenshots — **not** the production visitor demo path.

Fixtures live in [`lib/demo/fixtures.ts`](./lib/demo/fixtures.ts).

### Manual QA checklist

- [ ] `/login` shows **Continue as Demo User** when demo UI is enabled
- [ ] `/demo/enter` sets cookie and lands on `/dashboard/overview` as Chris
- [ ] Overview, Activity, Accounts, Settings load with sample data
- [ ] Demo banner and **Demo** badge visible; overview card explains sample inbox
- [ ] Run sync shows simulated success; undo shows “Demo action simulated”
- [ ] Connect Gmail shows demo copy + link to sign in (no OAuth)
- [ ] Sign out returns to login and clears demo state
- [ ] Real GitHub/Google login still works; demo cookie cleared after OAuth
- [ ] Mobile layout usable at 375px width

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Local dev (webpack; required for NextAuth `/api/auth/*` catch-all) |
| `npm run build` / `npm start` | Production |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest (demo mode unit tests) |

## Screenshots

Capture curated dashboard images into [`public/screenshots/`](./public/screenshots/) for README/marketing (see that folder’s README).

## UI upgrade plans

| Doc | Scope |
|-----|--------|
| [`mailpilot-ui-upgrade-plan.md`](../plans/mailpilot-ui-upgrade-plan.md) | Phases 1A–5 (routing, shell, metrics, activity, demo) |
| [`mailpilot-phase-6-visual-polish.md`](../plans/mailpilot-phase-6-visual-polish.md) | Phase 6 visual polish (6A–6E) |
| [`mailpilot-phase-7-8-showcase-closure.md`](../plans/mailpilot-phase-7-8-showcase-closure.md) | Login parity, TopBar sync link, tab refresh, docs closure |

### Verification (before deploy)

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Smoke-test Gmail connect, manual sync, undo, pagination, sign out, and 375px mobile layout per the UI plan §8 matrix.
