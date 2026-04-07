# MailPilot AI

**An AI-driven inbox copilot** that reads intent—not just metadata—to tame Gmail. MailPilot pairs a **Next.js dashboard** (auth, Gmail linking, history, controls) with a **Python worker** (classification, Gmail actions, OpenAI) coordinated through **Supabase**.

## Vision

MailPilot acts as an **invisible chief of staff** for email. Large language models interpret what messages mean and what you likely need next, then help **categorize**, **archive** noise, and **highlight** what matters. The goal is a calm, trustworthy system that works in the background while you stay in control.

## Monorepo layout

```text
mailpilot-ai/
├── mailpilot-runner/   # Python engine (CLI, Gmail, OpenAI, Supabase persistence)
├── mailpilot-web/      # Next.js app (Supabase Auth, Google OAuth UX, dashboard)
├── .github/            # CI workflows
└── LICENSE
```

### `mailpilot-web` — control plane

**Next.js** (App Router, TypeScript, Tailwind). Handles **Supabase Auth**, the **Google OAuth** flow that stores Gmail refresh tokens in `accounts`, the **dashboard** (history, undo, “Process inbox”), and **API routes** that read/write Supabase. See [`mailpilot-web/README.md`](mailpilot-web/README.md) and [`mailpilot-web/ARCHETECTURE.md`](mailpilot-web/ARCHETECTURE.md).

### `mailpilot-runner` — execution engine

**Python** worker: **Gmail API**, **OpenAI** classification, label/archive actions, and **Supabase** as the system of record (`accounts`, `processed_emails`, `run_jobs`). CLI commands include `run`, `run-once`, `watch-jobs` (job queue consumer for the dashboard), `history`, and `supabase-check`. Full setup: [`mailpilot-runner/README.md`](mailpilot-runner/README.md).

---

## Standalone runner + web app (why this pattern?)

MailPilot deliberately splits **orchestration and UX** (Next.js) from **email processing** (Python). They communicate **only through Supabase** (Postgres + Auth): the web app inserts **jobs** and **rows**; the runner **claims jobs**, reads tokens, calls Gmail/OpenAI, and writes results. Nothing requires the two processes to share a host.

### How it works in this repo

1. Users sign in and connect Gmail in the **web app**; refresh tokens live in Supabase.
2. The dashboard can queue a run (`run_jobs`) or you can run **`python -m mailpilot.main watch-jobs`** so a long-lived process picks up those jobs.
3. Alternatively, **`run`** / **`run-once`** poll on a timer or cron without the web UI.
4. **History** is stored in **`processed_emails`**; the dashboard reads it with the user’s session (RLS). Some flows (e.g. undo from the UI) use **server-side** routes with the **service role** where appropriate—still no OpenAI in Next.js.

This is a **decoupled “control plane / data plane”** shape: the browser triggers intent; the runner performs durable, side-effect-heavy work.

### Pros (MailPilot and similar systems)

| Benefit | Why it matters |
|--------|----------------|
| **Right runtime for the job** | Heavy Gmail batching, retries, and Python ML clients fit a normal process or VM better than a short-lived serverless function. |
| **Isolation of secrets** | OpenAI and service-role DB access stay on the worker host you trust; the edge app can stick to anon/session keys for user-scoped reads. |
| **No serverless timeouts** | A single run can touch many messages without hitting a 10–60s HTTP limit. |
| **Independent scaling** | Scale web traffic and worker capacity separately (e.g. many users on Vercel, one beefy worker, or N workers with a real queue later). |
| **Clear blast radius** | A bug in the dashboard is less likely to become arbitrary code execution on the worker. |
| **Local development** | Run Postgres/Supabase in the cloud, Next on `localhost`, and the runner in a terminal—all see the same data. |

### Cons (tradeoffs to own)

| Cost | Mitigation |
|------|------------|
| **Two things to run** | Document “web + `watch-jobs`” for interactive runs; use `run` + cron for unattended. |
| **Operational surface** | If the worker is down, queued jobs sit **pending**—the UI should say so (MailPilot does). |
| **Eventual consistency** | Users see results after the next poll/process; not a single synchronous RPC. |
| **Duplicated configuration** | Both sides need Supabase (and the web app needs `SUPABASE_SERVICE_ROLE_KEY` only for specific server routes). Keep `.env.example` files aligned. |
| **Onboarding friction** | New contributors must understand two stacks. This README and package READMEs exist for that. |

### When this pattern is a good fit (in general)

- Work is **batch-oriented**, **long-running**, or talks to APIs with **rate limits** and **retries**.
- You want **one web stack** (e.g. Next) for UX and **another** for scripts/ML/integrations.
- You already have or want a **shared database** or **queue** as the integration point.

### When to reconsider

- **Very low volume** and **tight latency**: a single Next.js app with background jobs on your host (or a managed queue with one worker type) might be simpler.
- **Strict “one deployable”** org standards: a monolith or BaaS-only approach may win politically even if less flexible.

---

## Development setup

Open the **repository root** in your IDE so both packages appear in one workspace.

- **Runner** — Python venv, `SUPABASE_*`, `OPENAI_API_KEY`, and CLI commands: [`mailpilot-runner/README.md`](mailpilot-runner/README.md). For dashboard-triggered runs, use **`watch-jobs`** alongside the web app.
- **Web app** — From `mailpilot-web`: copy `.env.local.example` → `.env.local`, `npm install`, `npm run dev`. Details: [`mailpilot-web/README.md`](mailpilot-web/README.md).

**Database schema** — [`mailpilot-web/supabase/schema.sql`](mailpilot-web/supabase/schema.sql) and incremental files under [`mailpilot-web/supabase/migrations/`](mailpilot-web/supabase/migrations/). Apply in the Supabase SQL Editor or via `supabase db push` when linked.

## Roadmap (snapshot)

- **Done (high level):** Supabase + RLS, web auth and Gmail OAuth, Python persistence on Supabase, dashboard history and run queue, web undo for processed messages.
- **Ahead:** Richer rules engine, pagination/filters in the UI, hardened multi-worker job claiming, optional deployment guides (Vercel + fly.io / VM worker).

## License

See [`LICENSE`](LICENSE).
