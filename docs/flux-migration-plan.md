# MailPilot Flux Migration Plan

## Target shape

MailPilot should move from Supabase to a Flux `v1_dedicated` project first.
That keeps the trusted Python worker, Postgres functions, and service-level
database operations close to the current architecture while removing Supabase
as the hosted dependency.

The intended production host is `https://mailpilot.vsl-base.com`.

## Migration phases

### 1. Identity

- Replace Supabase Auth with Auth.js.
- Use GitHub OAuth for MailPilot app sign-in initially.
- Keep Gmail OAuth separate; it is still the flow that grants `gmail.modify`
  and stores the Gmail refresh token in `accounts.token_json`.
- Use a stable text `user_id` from the Auth.js session as the database owner id.

### 2. Data plane

- Create a Flux project named `mailpilot`.
- Port the existing tables and job RPC functions to the Flux API schema.
- Remove `auth.users` foreign keys from the application tables unless an app
  users table is introduced.
- Preserve the current table boundaries:
  - `accounts`
  - `processed_emails`
  - `processing_claims`
  - `run_jobs`
- Preserve the current job RPC functions:
  - `claim_next_run_job()`
  - `reap_stale_run_jobs()`

### 3. Application access

- Replace `@supabase/ssr` and `@supabase/supabase-js` usage with local helpers.
- Web server code should use trusted server-side access for sensitive operations
  like undo and job status hydration.
- Browser realtime subscriptions should be removed; the existing `/api/run`
  polling path should become the primary run-status update mechanism.
- The Python runner should use direct Postgres access (`psycopg`) or a trusted
  Flux service HTTP path instead of `supabase-py`.

### 4. Data migration

- Keep raw Supabase dumps private and uncommitted. The data dump contains Gmail
  OAuth token material.
- Use the raw schema dump as a reference only; commit a Flux-native schema
  migration under `flux/migrations/`.
- Transform the raw data dump into a private Flux import artifact:
  - `public` schema references become `api`.
  - Supabase UUID `user_id` values become Auth.js text user ids.
  - sequence resets target Flux identity-backed tables only after import.
- Current private dump shape:
  - `accounts`: 3 rows
  - `processed_emails`: 69 rows
  - `processing_claims`: 0 rows
  - `run_jobs`: 48 rows
  - Supabase owner UUID: `d9111510-c4c9-4b39-a527-4bd04d01f74a`
- Required before importing data: map that Supabase owner UUID to the new
  Auth.js user id. With the current GitHub provider callback, that will look
  like `github:<github-provider-account-id>`.
- Import transformed rows into Flux only after the schema migration is applied.
- Verify connected accounts, processed email history, manual sync, job claiming,
  and undo.

### 5. Launch

- Deploy the Next.js app at `https://mailpilot.vsl-base.com`.
- Run the Python worker as a long-lived service with `watch-jobs`.
- Register production OAuth redirects:
  - Auth.js GitHub callback: `https://mailpilot.vsl-base.com/api/auth/callback/github`
  - Gmail callback: `https://mailpilot.vsl-base.com/auth/google/callback`
- Smoke test sign-in, Gmail connect, manual sync, history refresh, and undo.

## Current state

- Flux CLI is healthy and authenticated as `justinkemersion@pm.me`.
- Flux project `mailpilot-ai` exists as `v1_dedicated`.
- `flux.json` points at:

```text
https://api--mailpilot-ai--02d83e6.vsl-base.com
```

- The Flux schema migration has passed:
  - `flux push flux/migrations/ --plan`
  - `flux push flux/migrations/ --dry-run`

Do not apply the schema migration until the data mapping above is confirmed.
