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

## Demo / showcase mode

For a public Flux showcase without real mailbox data:

```bash
# .env.local or container env (server-only — never NEXT_PUBLIC_)
MAILPILOT_DEMO_MODE=true
NEXT_PUBLIC_DEMO_BANNER=true
```

When `MAILPILOT_DEMO_MODE=true`:

- Server reads return fixture data from [`lib/demo.ts`](./lib/demo.ts) (no Flux calls for dashboard queries).
- Mutations (`/api/run`, `/api/undo`, `/api/accounts/*`) return HTTP 403.
- `/auth/google` redirects to `/dashboard/overview?demo=true` instead of starting OAuth.

**Production deployments must leave `MAILPILOT_DEMO_MODE` unset or `false`.** See [`deploy/README.md`](../deploy/README.md).

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Local dev |
| `npm run build` / `npm start` | Production |
| `npm run lint` | ESLint |

## Screenshots

Capture curated dashboard images into [`public/screenshots/`](./public/screenshots/) for README/marketing (see that folder’s README).

## UI upgrade plan

Implementation phases and design notes: [`plans/mailpilot-ui-upgrade-plan.md`](../plans/mailpilot-ui-upgrade-plan.md).
