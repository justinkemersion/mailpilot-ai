# MailPilot AI - Architecture & Migration Plan

## 1. The Vision
MailPilot is transitioning from a single-user, local Python CLI tool into a multi-tenant, cloud-based Web Application. 
- **The frontend** will be a Next.js dashboard where users can log in, connect their Gmail, and view their inbox history.
- **The backend engine** will remain in Python. It will act as a headless background worker that polls the database, processes emails using OpenAI and the Gmail API, and logs the results.
- **The bridge** between them is Supabase (PostgreSQL + Auth).

## 2. Monorepo Structure & Boundaries
We use a monorepo to separate concerns. **CRITICAL RULE FOR AI:** Never mix the responsibilities of these two environments.

### `/mailpilot-web` (The Steering Wheel)
- **Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Supabase Auth, `lucide-react`, and (on the server only) **`google-auth-library`** + **`googleapis`** for the undo flow’s OAuth token refresh and Gmail `users.messages.modify`.
- **Responsibilities:**
  - User Authentication (Sign up / Log in).
  - Google OAuth flow (getting the Google Refresh Token from the user).
  - Displaying the Dashboard (connected accounts, email history, undo, manual sync trigger).
- **Boundary:** The **browser** never calls Gmail or OpenAI directly. **Route handlers** may call Gmail using env `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` plus the user’s refresh token loaded from Supabase (`POST /api/undo`). Routine inbox processing stays in the Python worker.

### `/mailpilot-runner` (The Engine)
- **Tech Stack:** Python 3.11, OpenAI SDK, Google API Python Client.
- **Responsibilities:**
  - Running as a continuous background process (e.g., via cron or a while loop).
  - Querying Supabase for accounts that are **active** and **processing-enabled** (see `accounts.processing_enabled`), with Google refresh tokens from the web OAuth flow.
  - Fetching emails, calling OpenAI for classification, and applying Gmail labels.
  - Writing the `actions_taken` history back to Supabase.
- **Hard Limit:** Python will **no longer** handle user input (CLI `add-account`), local SQLite, or browser-based OAuth flows.

## 3. Migration Roadmap

### Phase 1: Database Migration (Done)
- Migrate from local SQLite to Supabase PostgreSQL.
- Recreate `ProcessedEmail` and `Account` tables.
- Add `user_id` (UUID) to support multi-tenancy.
- Implement Row Level Security (RLS) so users only see their own data.
- **Account flags:** `active` means the Gmail link exists; `processing_enabled` (default `true`) means the Python worker should include this account in runs. Pausing in the dashboard only flips `processing_enabled` (tokens stay stored; the account remains connected).

### Phase 2: Web Auth & OAuth Setup (Done)
- Implement Supabase Auth in Next.js.
- Create a Next.js API route to handle Google OAuth callback.
- securely store the Google `refresh_token` in the Supabase `accounts` table.

### Phase 3: Python Worker Refactor (Done)
- Replace SQLite with Supabase-backed persistence (`mailpilot.persistence`).
- Update the worker to iterate eligible accounts from Supabase (`list_active`: `active` and `processing_enabled` both true; optional `user_id` filter for tenant isolation).
- Typer CLI remains for `run`, `run-once`, `watch-jobs`, `history`, etc.
- **`watch-jobs` + `run_jobs`:** The dashboard inserts a row with `user_id` = the signed-in user. The runner claims jobs via Postgres RPC **`claim_next_run_job()`** (`FOR UPDATE SKIP LOCKED`, single atomic update). Each run executes **`process_all_accounts_once(user_id=…)`** so **only that user’s** linked accounts are processed. **`reap_stale_run_jobs()`** marks `running` jobs older than 15 minutes as `failed` (startup + each poll). Apply the migration in [`supabase/migrations/`](supabase/migrations/) that defines these functions.
- **`run-once` / `run_forever`:** No `user_id` is passed — operator mode processes **all** eligible accounts in the project.

### Phase 4: The Dashboard UI (Done)
- **Layout:** Mobile-first dashboard: header with **Run sync** (opens a native `<dialog>` for look-back, include-read, and dry-run options), user session, and sign-out; main sections for connected Gmail accounts and email history.
- **Connected accounts:** Compact cards with a **pause processing** switch (`PATCH /api/accounts/:id`) and **disconnect** (`DELETE /api/accounts/:id`). **Connect Gmail** remains the OAuth entry point.
- **Manual runs:** **Run sync** enqueues a `run_jobs` row scoped to the current user; **`watch-jobs`** claims it atomically and runs the pipeline **only for that user’s accounts** (not the whole database). See [root `README.md`](../README.md#standalone-runner--web-app-why-this-pattern) for the runner/web split and tradeoffs.
- **History:** Table with category filter pills, per-account color avatars (tooltip = email), parsed sender name + address, and icon-based **undo** calling `POST /api/undo` with loading state; on success the client calls **`router.refresh()`** so RSC data stays aligned with `[UNDONE]` in Supabase.

### Web API routes (dashboard-related)
| Route | Role |
|--------|------|
| `POST/GET /api/run` | Queue and poll `run_jobs` for manual sync (insert includes `user_id`; worker respects it). |
| `PATCH /api/accounts/[id]` | Body `{ processing_enabled }`. Updates the row where `id` and `user_id` match the session; returns the updated account (no `token_json`). |
| `DELETE /api/accounts/[id]` | Deletes the linked account where `id` and `user_id` match the session (cascades per schema). |
| `POST /api/undo` | Body `{ processed_email_id }`. Loads `processed_emails` **joined to** `accounts` (service client + `user_id` checks), refreshes access with **OAuth2Client** + stored `refresh_token`, runs **Gmail** `users.messages.modify` (restore `INBOX`/`UNREAD`, remove labels from `applied_label_names`), then appends `[UNDONE]` to `actions_taken`. |

**Undo and `run_jobs`:** Undo is **not** a queued worker job today; it is **only** `POST /api/undo` (session-scoped). If a future `job_type` (e.g. `undo`) is added to `run_jobs`, the worker handler must enforce `processed_emails.user_id == job.user_id` before calling Gmail.

Connected-account cards use **`router.refresh()`** after successful PATCH/DELETE so the account list stays in sync with the server.

## 5. Repo backlog and agent entrypoint

Session-agnostic deferred work lives in the monorepo root: [BACKLOG.md](../BACKLOG.md). The root [AGENTS.md](../AGENTS.md) file points there, to this document, and to [mailpilot-web/AGENTS.md](AGENTS.md) for Next.js-specific rules.
