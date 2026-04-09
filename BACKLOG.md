# MailPilot backlog

Follow-ups that should survive Cursor sessions and chat history. Prefer tracking deferred work here (and closing or updating items when done) instead of relying only on session notes or ephemeral plan files.

**Architecture and migration context:** [mailpilot-web/ARCHETECTURE.md](mailpilot-web/ARCHETECTURE.md)

---

## Web dashboard (`mailpilot-web`)

### Email History: updates when sync runs outside this browser tab

**Context:** After a manual sync from the dashboard, `router.refresh()` runs when the UI sees the same `run_jobs` row go from `pending` / `running` to `done`, so **Email History** refetches without a full page reload. That path does **not** run when mail is processed elsewhere (scheduled `run` / `run-once`, another host, another tab that did not drive the job lifecycle, etc.), so history can stay stale until the user navigates or reloads.

**Possible approaches:** Supabase Realtime on `processed_emails` (`INSERT`, RLS-scoped to the signed-in user); a light interval calling `router.refresh()` while the dashboard is mounted; `document.visibilitychange` or window-focus handlers to refetch.

**Pointers:** [mailpilot-web/app/dashboard/RunSyncControl.tsx](mailpilot-web/app/dashboard/RunSyncControl.tsx), [mailpilot-web/app/dashboard/HistoryTable.tsx](mailpilot-web/app/dashboard/HistoryTable.tsx).
