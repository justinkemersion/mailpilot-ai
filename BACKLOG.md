# MailPilot backlog

Follow-ups that should survive Cursor sessions and chat history. Prefer tracking deferred work here (and closing or updating items when done) instead of relying only on session notes or ephemeral plan files.

**Architecture and migration context:** [mailpilot-web/ARCHETECTURE.md](mailpilot-web/ARCHETECTURE.md)

---

## Web dashboard (`mailpilot-web`)

### Phase 9 scoped inbox resolution — deploy closure

**Context:** Phases A–H shipped on `main`. Production database is **Flux only** (`flux/migrations/`).

**Deploy checklist:**

- Apply pending Flux SQL migrations individually with `flux push flux/migrations/00N_….sql` when needed.
- `git pull` on server, rebuild web container, restart runner per [`deploy/README.md`](deploy/README.md).
- Confirm `MAILPILOT_LEGACY_AUTO_ARCHIVE` is unset or `0` unless rollback is needed.
- Verify DB with `python -m mailpilot.main flux-check` on the server.

**Pointers:** [plans/mailpilot-phase-9-scoped-inbox-resolution.md](plans/mailpilot-phase-9-scoped-inbox-resolution.md)

### Email History: updates when sync runs outside this browser tab

**Context:** After a manual sync from the dashboard, `router.refresh()` runs when the UI sees the same `run_jobs` row go from `pending` / `running` to `done`, so **Email History** refetches without a full page reload. That path does **not** run when mail is processed elsewhere (scheduled `run` / `run-once`, another host, another tab that did not drive the job lifecycle, etc.), so history can stay stale until the user navigates or reloads.

**Possible approaches:** Flux Realtime (if enabled) on `processed_emails`; a light interval calling `router.refresh()` while the dashboard is mounted; `document.visibilitychange` or window-focus handlers to refetch.

**Partial mitigation (Phase 7):** `AppShell` calls `router.refresh()` when the document becomes visible again — helps when the user returns to the tab but not when sync completes while the tab stays focused.

**Pointers:** [mailpilot-web/components/AppShell.tsx](mailpilot-web/components/AppShell.tsx), [mailpilot-web/app/dashboard/RunSyncControl.tsx](mailpilot-web/app/dashboard/RunSyncControl.tsx), [mailpilot-web/app/dashboard/HistoryTable.tsx](mailpilot-web/app/dashboard/HistoryTable.tsx).

### Mailbox identity (reconnect)

**Rule:** Durable mailbox key is `user_id` + `provider` + `normalized_email` (lowercase trimmed Gmail address). OAuth subject / NextAuth `providerAccountId` is **not** the mailbox identity. `accounts.id` is the FK hub for sync history, scope, rules, and preferences.

**Reconnect:** OAuth callback upserts on that identity and replaces `token_json`. Soft disconnect (`active=false`) preserves the row and dependent data; expired-token disconnect also sets `needs_reauth=true` and clears tokens.

**Migration:** `flux/migrations/007_mailbox_identity.sql` — includes a dry-run CTE (comment block) listing duplicate identity groups before merge.

**Deployed:** `23c6d9b` on `2026-06-19` — Flux `007` applied; web + runner redeployed; smoke OK.

### Database plane (Flux only)

Supabase is **not** used in production or local dev. All app data lives in Flux (`api` schema). Web uses `lib/flux/client.ts`; runner uses Flux PostgREST (`flux_postgrest.py`). Health check: `python -m mailpilot.main flux-check`.

---
