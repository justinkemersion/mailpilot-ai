# MailPilot Phases 7–8 — Showcase Closure

> Follow-up to [`mailpilot-phase-6-visual-polish.md`](mailpilot-phase-6-visual-polish.md) (6A–6E complete).

**Goal:** Finish deferred showcase items — login parity with dashboard chrome, lightweight live freshness, TopBar sync navigation, and verification/docs closure. No API/schema/OAuth/runner changes.

---

## Phase 7 — Login, navigation, and live freshness

**Goals:** First-run and return visits feel like the same product; dashboard data refreshes when the user returns to the tab.

**Files:**
- `app/login/LoginForm.tsx` — BrandMark, semantic tokens, `AlertBanner` errors
- `app/dashboard/ConnectGmailLink.tsx` — accent primary CTA
- `app/dashboard/RunSyncControl.tsx` — `id="sync"` anchor, surface tokens
- `components/TopBar.tsx` — “Sync” link to Overview `#sync` (navigation only)
- `components/AppShell.tsx` — `visibilitychange` → `router.refresh()`
- `components/DemoBanner.tsx` — align max-width with shell
- `app/globals.css` — `#sync` scroll margin for sticky TopBar

**Acceptance criteria:**
- [x] Login page shows brand mark + tagline consistent with sidebar
- [x] Connect Gmail uses accent styling
- [x] TopBar “Sync” navigates to Overview sync section; does not queue jobs globally
- [x] Returning to a dashboard tab triggers server refresh (metrics, activity, accounts)
- [x] `prefers-reduced-motion` unchanged

---

## Phase 8 — Verification and documentation closure

**Goals:** Mark the UI upgrade program complete; document verification and remaining debt.

**Files:**
- `plans/mailpilot-ui-upgrade-plan.md` — status includes Phases 6–8
- `plans/mailpilot-phase-6-visual-polish.md` — cross-link Phase 7–8
- `mailpilot-web/README.md` — phase references, verification note
- `BACKLOG.md` — note partial visibility refresh mitigation

**Acceptance criteria:**
- [x] Automated checks documented and passing (`tsc`, `lint`, `build`)
- [x] Manual verification matrix from UI plan §8 recorded as smoke-tested on deploy
- [x] Deferred items (RunSyncProvider, Realtime, screenshots) explicitly listed as post-8

### Post–Phase 8 deferrals

- **RunSyncProvider** — global TopBar sync with cross-route polling/refresh (see Phase 6 plan §5)
- **Supabase Realtime** — live activity inserts without tab visibility refresh
- **`public/screenshots/`** — capture curated PNGs per folder README when marketing needs them

---

*Related: [`mailpilot-ui-upgrade-plan.md`](mailpilot-ui-upgrade-plan.md) §8 Testing and Verification*
