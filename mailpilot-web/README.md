# MailPilot Web

Next.js **App Router** app: **Supabase Auth**, **Google OAuth** (Gmail refresh tokens stored in Supabase), **dashboard** (connected accounts, email history, “Process inbox”, undo).

## How it fits the monorepo

The web app is the **control plane**. It does **not** run the Python classifier or bulk Gmail processing. Those run in [`mailpilot-runner`](../mailpilot-runner). The two communicate through **Supabase** (e.g. `run_jobs`, `processed_emails`, `accounts`). Rationale and tradeoffs: [root `README.md`](../README.md#standalone-runner--web-app-why-this-pattern).

Boundaries and migration notes: [`ARCHETECTURE.md`](./ARCHETECTURE.md).

## Setup

1. **Environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in at least:

   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for some API routes such as job status hydration)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` (must match Google Cloud OAuth redirect URIs)

2. **Install and dev server**

   ```bash
   npm install
   npm run dev
   ```

3. **Database** — Apply [`supabase/schema.sql`](./supabase/schema.sql) (and any [`supabase/migrations/`](./supabase/migrations/) files) in the Supabase SQL Editor, or use the Supabase CLI if the project is linked.

4. **Processing email** — Link Gmail in the UI, then run the Python worker, e.g.:

   ```bash
   cd ../mailpilot-runner
   source .venv/bin/activate
   python -m mailpilot.main watch-jobs
   ```

   Use **Process inbox** on the dashboard to queue work; `watch-jobs` picks up `run_jobs`. Alternatively use `run-once` / `run` without the queue.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Local dev (Turbopack per project config) |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |

Optional: `npx tsx --env-file=.env.local scripts/test-supabase.ts` — quick connectivity check (see script header).

## Learn More

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase + Next.js](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
