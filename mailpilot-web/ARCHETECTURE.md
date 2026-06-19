# MailPilot AI - Architecture & Migration Plan

## 1. The Vision
MailPilot is a multi-tenant cloud web application.
- **The frontend** is a Next.js dashboard where users log in (Auth.js), connect Gmail, and view inbox history.
- **The backend engine** is a Python worker that polls Flux for jobs, processes email via OpenAI and Gmail, and writes results back.
- **The bridge** is **Flux** (PostgreSQL + PostgREST, schema `api`). Supabase is no longer used.

## 2. Monorepo Structure & Boundaries

### `/mailpilot-web` (The Steering Wheel)
- **Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Auth.js, `lucide-react`, Flux PostgREST (`lib/flux/client.ts`), and (server-only) **`google-auth-library`** + **`googleapis`** for undo.
- **Responsibilities:** App sign-in, Gmail OAuth connect, dashboard UI, manual sync via `run_jobs`.
- **Boundary:** Browser never calls Gmail/OpenAI directly. Route handlers use Flux service token or session-scoped APIs.

### `/mailpilot-runner` (The Engine)
- **Tech Stack:** Python 3.11+, OpenAI SDK, Google API Python Client, Flux PostgREST client.
- **Responsibilities:** `watch-jobs`, Gmail fetch/classify/label, write `processed_emails` and audit rows to Flux.
- **Hard Limit:** No browser OAuth in Python; tokens come from web OAuth into `api.accounts`.

## 3. Data plane (Flux)

- Schema migrations: [`flux/migrations/`](../../flux/migrations/) — apply with `flux push`.
- Reference mirror (not production path): [`supabase/schema.sql`](supabase/schema.sql) and [`supabase/migrations/`](supabase/migrations/).
- **`watch-jobs` + `run_jobs`:** Dashboard inserts `run_jobs` for the signed-in user. Runner claims via **`claim_next_run_job()`** RPC and runs **`process_all_accounts_once(user_id=…)`**. **`reap_stale_run_jobs()`** marks stale `running` jobs failed.

### Phase 4: The Dashboard UI (Done)
- Manual runs enqueue `run_jobs`; **`watch-jobs`** processes only that user's accounts.
- Connected accounts: pause (`PATCH`), soft disconnect (`DELETE` → `active=false`, tokens cleared; history preserved).
- History + undo via Flux-backed APIs.

## 5. Repo backlog and agent entrypoint

Session-agnostic deferred work: [BACKLOG.md](../BACKLOG.md). Root [AGENTS.md](../AGENTS.md) points to deploy contract and web rules.
