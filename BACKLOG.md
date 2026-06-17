# MailPilot backlog

Follow-ups that should survive Cursor sessions and chat history. Prefer tracking deferred work here (and closing or updating items when done) instead of relying only on session notes or ephemeral plan files.

**Architecture and migration context:** [mailpilot-web/ARCHETECTURE.md](mailpilot-web/ARCHETECTURE.md)

---

## Web dashboard (`mailpilot-web`)

### Phase 9 scoped inbox resolution: remaining phases F-G

**Context:** Phases A-E are implemented (commit pending deploy). Cleanup resolves mail manually; teach saves scoped preferences; runner logs `archive_blocked` when a taught rule matches but hard stops block.

**Remaining work:**

- Phase F: add `GET /api/action-log`, Activity audit filters/explain panels, blocked/archive copy, and `undo_archive` logging with `resolution_status` updates.
- Phase G: enable cautious automation only for user-approved scoped rules, with hard stops and fail-closed action logging before any automatic archive.

**Pointers:** [plans/mailpilot-phase-9-scoped-inbox-resolution.md](plans/mailpilot-phase-9-scoped-inbox-resolution.md), [mailpilot-web/app/api/messages/[processed_email_id]/teach/route.ts](mailpilot-web/app/api/messages/[processed_email_id]/teach/route.ts), [mailpilot-web/app/api/preferences/route.ts](mailpilot-web/app/api/preferences/route.ts), [mailpilot-web/lib/preferenceGuard.ts](mailpilot-web/lib/preferenceGuard.ts).

### Email History: updates when sync runs outside this browser tab

**Context:** After a manual sync from the dashboard, `router.refresh()` runs when the UI sees the same `run_jobs` row go from `pending` / `running` to `done`, so **Email History** refetches without a full page reload. That path does **not** run when mail is processed elsewhere (scheduled `run` / `run-once`, another host, another tab that did not drive the job lifecycle, etc.), so history can stay stale until the user navigates or reloads.

**Possible approaches:** Supabase Realtime on `processed_emails` (`INSERT`, RLS-scoped to the signed-in user); a light interval calling `router.refresh()` while the dashboard is mounted; `document.visibilitychange` or window-focus handlers to refetch.

**Partial mitigation (Phase 7):** `AppShell` calls `router.refresh()` when the document becomes visible again — helps when the user returns to the tab but not when sync completes while the tab stays focused.

**Pointers:** [mailpilot-web/components/AppShell.tsx](mailpilot-web/components/AppShell.tsx), [mailpilot-web/app/dashboard/RunSyncControl.tsx](mailpilot-web/app/dashboard/RunSyncControl.tsx), [mailpilot-web/app/dashboard/HistoryTable.tsx](mailpilot-web/app/dashboard/HistoryTable.tsx).
