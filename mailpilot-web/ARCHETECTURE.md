# MailPilot AI - Architecture & Migration Plan

## 1. The Vision
MailPilot is transitioning from a single-user, local Python CLI tool into a multi-tenant, cloud-based Web Application. 
- **The frontend** will be a Next.js dashboard where users can log in, connect their Gmail, and view their inbox history.
- **The backend engine** will remain in Python. It will act as a headless background worker that polls the database, processes emails using OpenAI and the Gmail API, and logs the results.
- **The bridge** between them is Supabase (PostgreSQL + Auth).

## 2. Monorepo Structure & Boundaries
We use a monorepo to separate concerns. **CRITICAL RULE FOR AI:** Never mix the responsibilities of these two environments.

### `/mailpilot-web` (The Steering Wheel)
- **Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Supabase Auth.
- **Responsibilities:**
  - User Authentication (Sign up / Log in).
  - Google OAuth flow (getting the Google Refresh Token from the user).
  - Displaying the Dashboard (History, Undo UI, Settings).
- **Hard Limit:** Next.js will **never** interact directly with the Gmail API or OpenAI. It only reads/writes to Supabase.

### `/mailpilot-runner` (The Engine)
- **Tech Stack:** Python 3.11, OpenAI SDK, Google API Python Client.
- **Responsibilities:**
  - Running as a continuous background process (e.g., via cron or a while loop).
  - Querying Supabase for active users and their Google Refresh Tokens.
  - Fetching emails, calling OpenAI for classification, and applying Gmail labels.
  - Writing the `actions_taken` history back to Supabase.
- **Hard Limit:** Python will **no longer** handle user input (CLI `add-account`), local SQLite, or browser-based OAuth flows.

## 3. Migration Roadmap

### Phase 1: Database Migration (Done)
- Migrate from local SQLite to Supabase PostgreSQL.
- Recreate `ProcessedEmail` and `Account` tables.
- Add `user_id` (UUID) to support multi-tenancy.
- Implement Row Level Security (RLS) so users only see their own data.

### Phase 2: Web Auth & OAuth Setup (Done)
- Implement Supabase Auth in Next.js.
- Create a Next.js API route to handle Google OAuth callback.
- securely store the Google `refresh_token` in the Supabase `accounts` table.

### Phase 3: Python Worker Refactor (Done)
- Replace SQLite with Supabase-backed persistence (`mailpilot.persistence`).
- Update the worker to iterate active accounts from Supabase (tokens from the web OAuth flow).
- Typer CLI remains for `run`, `run-once`, `watch-jobs`, `history`, etc.

### Phase 4: The Dashboard UI (Done)
- Dashboard history table, **Process inbox** via `run_jobs` + `watch-jobs`, and undo via a Next.js API route (Gmail modify + Supabase update).
- See [root `README.md`](../README.md#standalone-runner--web-app-why-this-pattern) for the runner/web split and tradeoffs.
