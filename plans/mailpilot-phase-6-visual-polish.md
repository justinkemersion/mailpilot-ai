# MailPilot Phase 6 — Visual & Showcase Polish

> Follow-up to [`mailpilot-ui-upgrade-plan.md`](mailpilot-ui-upgrade-plan.md) (Phases 1A–5 complete and deployed).
> **Status:** In progress — Phases 6A–6C complete; 6D–6E pending.

**Goal:** Elevate the shipped UI from a competent internal dashboard to a polished Flux showcase product — **visual and compositional changes only**. No backend, OAuth, sync, undo, demo mode, schema, or API contract changes.

### Implementation progress

| Phase | Status | Notes |
|-------|--------|-------|
| **6A** — Overview composition | ✅ Complete | Preview limit 10, accounts snapshot, hero metrics |
| **6B** — Run result / sync UI | ✅ Complete | Summary + disclosure; preview header deduped |
| **6C** — Activity table density | ✅ Complete | Merged message column, action chips, centered load-more |
| **6D** — Sidebar / TopBar identity | Pending | |
| **6E** — Mobile and final visual QA | Pending | |

---

## 1. Current Visual Audit

Phases 1–5 delivered correct structure and behavior. The remaining gap is **visual hierarchy, breathing room, and product voice**. The app reads as “working admin UI” rather than “premium personal email automation.”

### What is working

| Area | Files | Notes |
|------|-------|-------|
| Routing & shell | `AppShell.tsx`, `dashboard/layout.tsx` | Subroutes, skip link, demo banner slot, mobile drawer with Escape/scroll lock |
| Data honesty | `OverviewMetricsGrid.tsx`, `lib/dashboard/queries.ts` | Real Flux counts; `—` when unavailable; “All time” captions |
| Activity features | `EmailActivityTable.tsx`, `UndoActionButton.tsx` | Search, category tabs, load-more, undo visible (not buried), mobile card view |
| Accessibility baseline | `lib/ui.ts`, `Sidebar.tsx`, `RunSyncControl.tsx` | `focusRing`, `aria-live`, switch roles, table captions |
| Design tokens (defined) | `globals.css` | `--surface-*`, `--text-*`, `--accent` exist in `:root` / `@theme inline` |

### What still feels raw

#### Sidebar identity (`Sidebar.tsx`)

- Header is plain text **“MailPilot”** — no mark, no tagline, no Flux/product positioning.
- Nav links are functional (`bg-zinc-800` active pill on `zinc-900`) but feel like a dark admin panel, not a product sidebar.
- **No user area** in the sidebar; identity is split to `TopBar` only.
- Desktop sidebar (`w-56`) and mobile drawer share the same minimal branding.

#### TopBar hierarchy (`TopBar.tsx`, `SignOutButton.tsx`)

- Shows **page title** (e.g. “Overview”) as the only headline — no secondary context (“your inbox automation”).
- User email hidden below `sm`; sign-out is a borderless text button that competes weakly with content headers.
- No primary action slot (Run Sync deliberately omitted — correct for now; see §5).

#### Metric cards (`MetricCard.tsx`, `OverviewMetricsGrid.tsx`)

- Grid uses tight `gap-3`; cards use `p-4` with `text-3xl` values — readable but not **hero-level**.
- Label and icon compete at similar visual weight; icons are small and muted in the corner.
- Metrics sit at the top but are visually **the same weight** as every other `rounded-xl border` card on the page — no clear “dashboard headline.”
- No category breakdown hint on Overview (data exists in `metrics.by_category` but is only used inside Activity filters).

#### Classifier card (`ClassifierStatusCard.tsx`)

- Presents a **metadata grid** (Provider, Model, Last run, LLM calls) — accurate but reads like run logs, not a product feature.
- Overlaps conceptually with `RunSyncControl`’s inline `ClassifierSourceBadge` during/after sync.
- Empty state copy (“Run a sync to see which model…”) is instructional, not inviting.
- `StatusBadge` for pending/running on this card is useful but visually disconnected from the rest of the Overview story.

#### Manual sync / run result UI (`RunSyncControl.tsx`, `RunSyncButton.tsx`, `RunResultBanner.tsx`)

- **Debug-console tone:** copy references `watch-jobs` in `<code>` blocks; modal subtitle explains worker queue mechanics.
- **`ActivityLog`** (`RunSyncControl.tsx` lines 123–180): live-scrolling log with `phase` labels (`classifier`, `ai_limit`) and raw runner messages — appropriate for ops, wrong default for a showcase.
- **`RunResultBanner`:** success state is a dense green paragraph listing accounts, messages, labels, archived, spam, LLM calls, rule-based, skipped-by-budget — **operator stats**, not a user-facing summary.
- Failed runs expose `font-mono text-[10px]` error strings inline.
- While a job is active, classifier badge + status dot + activity log + result banner stack vertically in the same card — **high visual noise** in the Overview’s 2-column row.

#### Connected account cards (`ConnectedAccountCard.tsx`, `ConnectedAccountsList.tsx`)

- Cards are correct functionally (avatar, toggle, disconnect, last activity).
- Layout is **vertically stacked** with a hard `border-t` footer — feels like settings rows, not “connected inboxes.”
- Status badge sits under email; toggle and trash share one cramped footer row.
- Overview **duplicates the full Accounts section** (`overview/page.tsx` lines 60–81) — same heading, list, and connect CTA as `/dashboard/accounts`, adding scroll length without new information hierarchy.

#### Overview activity preview (`overview/page.tsx`, `HistoryTable.tsx`, `EmailActivityTable.tsx`)

- **Dominance problem:** Overview fetches up to **50 rows** (`getEmailHistory` → `EMAIL_ACTIVITY_PAGE_SIZE` in `lib/dashboard/queries.ts`) and renders the **full** `EmailActivityTable` including `SearchInput`, `FilterTabs`, and 7-column desktop table.
- Section copy says “Last 50 emails” — contradicts a showcase Overview that should tease activity, not host a second Activity page.
- `HistoryTable` sets `paginate={false}` but does not set a **preview mode** — filters and search remain, overwhelming the bottom of the page.
- “View all activity →” link exists but competes with a table that already looks like the full experience.

#### Full Activity page (`activity/page.tsx`, `EmailActivityTable.tsx`)

- Table `min-w-[44rem]` forces horizontal scroll on narrower desktops.
- Seven columns with `uppercase tracking-wide` headers — admin-table aesthetic.
- **Sender** capped at `max-w-[200px]`; **Subject** at `max-w-[220px]` — aggressive truncation (`truncateText` 40/56 chars) hurts readability.
- **Actions** column shows raw `actions_taken` strings (`line-clamp-2`) — noisy and uneven width.
- **Undo** column uses full `min-h-11 min-w-11` icon button per row — correct a11y, visually heavy in a dense table.
- Filter tabs + search in `px-3 py-3` header — functional but visually flat; no separation between “toolbar” and “data.”
- Load-more is left-aligned in a footer strip — easy to miss after a long table.

#### Mobile view (`AppShell.tsx`, `EmailActivityTable.tsx`, `Sidebar.tsx`)

- Mobile **activity cards** are reasonable but repeat full metadata (actions text in small type).
- Overview on mobile: metrics 2-col → stacked classifier/sync → full accounts → **full activity chrome** — very long scroll.
- Drawer is plain `zinc-900`; no product footer or user snippet.

#### Empty / loading / error states (`EmptyState.tsx`, `LoadingSkeleton.tsx`, `AccountsEmptyState.tsx`)

- Empty states use dashed borders — correct pattern but same visual language as every card; not differentiated for “hero empty” vs “table empty.”
- Activity fetch errors are a red strip inside the table shell — good; overview connect banners are separate unstyled alert boxes.
- Loading skeleton applies on category change only — acceptable.

### Root cause (summary)

1. **One visual language for everything** — same `rounded-xl border border-zinc-200 bg-white p-4` for metrics, classifier, sync, accounts, and activity.
2. **Operator UI surfaced to end users** — logs, worker names, raw run stats, monospace errors.
3. **Overview composition mirrors a mega-page** — full accounts + full activity table instead of a curated summary.
4. **Tokens defined but unused** — components rely on ad hoc `zinc-*` utilities; surface hierarchy is flat.

---

## 2. Product Design Target

### North star

**Premium personal email automation** — calm, trustworthy, slightly technical. Useful for the owner day-to-day; presentable as a Flux showcase without pretending to be a different product.

### Visual principles

| Principle | Meaning for MailPilot |
|-----------|----------------------|
| **Calm hierarchy** | One focal region per viewport (Overview: metrics → status → preview). Secondary detail behind disclosure. |
| **Trust through clarity** | Show real numbers and real classifier identity; never fake metrics. Summarize before enumerating. |
| **Technical credibility** | AI classifier and run outcomes visible, but framed as product capabilities (“Inbox AI”, “Last sync”) not daemon logs. |
| **Restraint** | Linear/Vercel density: fewer borders, more whitespace, muted supporting text. No decorative gradients or motion-heavy UI. |
| **Honest density** | Activity table stays information-rich on `/dashboard/activity`; Overview stays intentionally light. |

### Anti-patterns to eliminate

- Default-visible runner activity logs and `watch-jobs` references
- Wall-of-text green success banners
- Full Activity table UX on Overview
- Duplicate full Accounts section on Overview when `/dashboard/accounts` exists
- Uppercase micro-label table headers as the dominant column voice

### Success criteria (qualitative)

A new visitor on `/dashboard/overview` should think: *“This is a polished tool that organizes my Gmail with AI”* — not *“This is a sync job monitor.”*

---

## 3. Overview Page Refinement

### Proposed composition (top → bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  Page intro (optional): one-line product context            │
├─────────────────────────────────────────────────────────────┤
│  HERO METRICS — 4 cards, larger type, more padding          │
│  (optional: subtle category chips row under metrics)        │
├──────────────────────────┬──────────────────────────────────┤
│  Classifier feature card │  Manual sync card (compact)      │
│  (product copy, 3 facts) │  (CTA + live status only)        │
├──────────────────────────┴──────────────────────────────────┤
│  Accounts snapshot — 1 row summary OR max 2 compact cards   │
│  + “Manage accounts →” (not full list if >2 accounts)       │
├─────────────────────────────────────────────────────────────┤
│  Recent activity PREVIEW — 8–12 rows, no search/filters     │
│  + prominent “View all activity →”                          │
└─────────────────────────────────────────────────────────────┘
```

### Section-by-section direction

#### A. Hero metrics

- Increase visual prominence: `p-5` or `p-6`, `text-4xl` values on `lg+`, `gap-4` grid.
- Optional: single-line **category summary** under the grid (e.g. top 3 categories by count as small pills) — uses existing `metrics.by_category`; no new API.
- Keep captions **“All time”** (already accurate).

#### B. Classifier + sync row

- **ClassifierStatusCard:** Reframe as “Inbox AI” feature — lead with model name; show at most **3 facts** (provider, last run, emails processed last run). Move LLM-call count behind `<details>` or omit from default view.
- **RunSyncControl (section variant):** Shrink default footprint — button + compact status line only. Hide `ActivityLog` and verbose classifier badge behind **“View run details”** disclosure while job is active or after complete (until dismissed).

#### C. Accounts snapshot (de-duplication)

- If **0 accounts:** keep `AccountsEmptyState` + connect CTA.
- If **1–2 accounts:** show compact horizontal cards (avatar, email, status dot, last activity).
- If **3+ accounts:** show count + “N accounts connected, M active” summary card with link to `/dashboard/accounts` — **do not** render full `ConnectedAccountsList` on Overview.

#### D. Activity preview (critical)

- New prop or wrapper: `EmailActivityTable` **`variant="preview"`** (or dedicated `OverviewActivityPreview.tsx`).
- **8–12 rows max:** add `OVERVIEW_ACTIVITY_PREVIEW_LIMIT = 10` in `lib/emailActivity.ts`; new `getEmailHistoryPreview()` or pass `limit: 10` in `getEmailHistory` for Overview only.
- **Hide** on preview: `SearchInput`, `FilterTabs`, load-more, category tab counts.
- **Show:** simplified columns on desktop (Received, Sender / Subject combined, Category, Undo); mobile cards unchanged but fewer rows.
- Update copy: “Recent activity” + “Last 10 processed emails” (or dynamic count).
- Keep **“View all activity →”** as primary secondary action (button style, not text link).

### Files primarily involved

- `app/dashboard/overview/page.tsx` — recompose sections, reduce fetches
- `lib/dashboard/queries.ts` — preview limit query
- `components/EmailActivityTable.tsx` or new `OverviewActivityPreview.tsx`
- `app/dashboard/HistoryTable.tsx` — pass preview props
- `ClassifierStatusCard.tsx`, `RunSyncControl.tsx`

---

## 4. Activity Page Refinement

### Layout

- Page header: stronger title block (`text-lg` / `text-xl` title, shorter subtitle).
- Table shell: separate **toolbar card** (search + filters) from **data card** (table body) with `gap-4` between them, or a single card with a softer toolbar background (`bg-surface-2` / `bg-zinc-50`).

### Table density & columns

| Column | Change |
|--------|--------|
| Received | Narrower; `text-xs tabular-nums`; relative-friendly optional (“2h ago”) — **display only**, same data |
| Account | Avatar only + `title` tooltip (hide duplicate text column) |
| Sender / Subject | **Merge** into one primary column: bold subject line, muted sender subline (email-client rhythm) |
| Category | `CategoryPill` `size="sm"`; fixed width column |
| Actions | Replace raw string with **compact action chips** parsed from `actions_taken` (e.g. “Archived”, “Labeled”, “Spam”) — client-side string parse only; same field |
| Undo | Smaller visual button (`min-h-9 min-w-9`) while keeping touch target via padding hit area; or text “Undo” on `lg+` |

### Column widths

- Drop `min-w-[44rem]`; use `table-fixed` with percentage widths: Received 12%, Account 6%, Message 40%, Category 14%, Actions 18%, Undo 10%.
- Prefer `min-w-0` + truncation on message column only.

### Search / filter rhythm

- Search full width on mobile; filters on second row with consistent `gap-2`.
- Active filter: keep indigo pill; inactive: softer `border` style instead of filled gray pills (less visual noise).

### Pagination / load-more

- Center load-more button; add **“Showing X of Y”** text above button.
- Consider sticky table header on scroll (`thead` `sticky top-0 bg-white`) — CSS only.

### Preserve

- Mobile card view (`ActivityMobileRow`)
- Undo visibility (`UndoActionButton` stays per-row, not in menu)
- Client-side search on loaded pages (no API change)
- Server pagination via existing `/api/activity`

---

## 5. Sidebar and TopBar Polish

### Product identity (sidebar header)

- **Logo mark:** simple monogram or mail+spark SVG (inline, no new asset pipeline required) + **MailPilot** wordmark.
- **Tagline:** one line under wordmark, e.g. “AI inbox automation” — `text-xs text-zinc-500`, hidden on collapsed/mobile drawer if tight.
- Slightly taller header (`h-16`) and more horizontal padding.

### Nav polish

- Increase vertical rhythm: `gap-0.5` → `gap-1`, item `px-3 py-2.5`.
- Active state: subtle **left border accent** or `bg-zinc-800/80` + `text-white` instead of flat gray block.
- Icons: optional `strokeWidth` consistency; active icon tint `text-indigo-400`.

### User area

- **Desktop sidebar footer:** user email truncated + Sign out link (move from TopBar or duplicate subtly).
- **TopBar:** keep sign-out on mobile; on desktop prefer sidebar footer to reduce header clutter.

### TopBar

- Replace bare page title with: **section title** + optional muted breadcrumb (“Dashboard / Overview”).
- On mobile, show small **MailPilot** mark next to hamburger when drawer closed (brand recall).

### Run Sync placement

| Option | Recommendation |
|--------|----------------|
| **Stay on Overview only** | **Default for Phase 6.** Lowest risk. |
| **Promote to TopBar** | **Defer to Phase 6E or post-6** unless refresh story is solved. |

**Refresh behavior (must understand before global promotion):**

- `RunSyncControl` calls `router.refresh()` when the polled job transitions active → `done` (`RunSyncControl.tsx` ~lines 218–231).
- That refresh only re-fetches **server components on the current route**. If Run Sync lived in `TopBar` / `AppShell`:
  - **Overview:** metrics, classifier, preview rows update — good.
  - **Accounts:** account list refreshes — good.
  - **Activity:** table `initialRows` refresh **only if** the Activity page remounts/refreshes — works when user stays on Activity and job completes, but **no live progress** unless `RunSyncControl` state is lifted to shell.
- Lifting sync state to `AppShell` is a **behavior/architecture change** (out of Phase 6 scope unless minimal: shared context + same polling logic, no API changes).

**Phase 6 plan:** Keep Run Sync on Overview; optionally add a **disabled/greyed “Run sync” in TopBar** that links to `#sync` on Overview — navigation only, not global mutation. Document TopBar promotion as Phase 7 or post-6 with explicit `RunSyncProvider` design.

### Mobile drawer

- Slightly wider tap targets; optional subtle top gradient on drawer header.
- Close button alignment with header mark.
- Focus trap is acceptable today; verify after footer user block added.

---

## 6. Component-Level Changes

| Component | Desired visual/UX change |
|-----------|-------------------------|
| **`Sidebar.tsx`** | Logo mark, tagline, refined active nav, footer user + sign out, `h-16` header |
| **`TopBar.tsx`** | Lighter header (less border weight), mobile brand mark, title + subtitle pattern; relocate sign-out on `lg+` |
| **`SignOutButton.tsx`** | Ghost/link variant for sidebar; compact icon+text optional |
| **`AppShell.tsx`** | Optional `max-w-6xl` for Overview breathing room; section spacing `space-y-10`; use `bg-surface-base` token |
| **`MetricCard.tsx`** | Larger value typography, softer border (`ring-1 ring-zinc-100`), optional accent top border on hover-none showcase |
| **`OverviewMetricsGrid.tsx`** | `gap-4`, optional category chip row, `aria` section title visible to screen readers |
| **`ClassifierStatusCard.tsx`** | Product feature framing, cap visible facts at 3, friendly empty state, remove duplicate run-status when idle |
| **`RunSyncControl.tsx`** | Split “compact shell” vs “details panel”; hide `ActivityLog` + ops copy by default; remove `watch-jobs` from default copy |
| **`RunSyncButton.tsx`** | Primary CTA styling on Overview (filled indigo); modal copy user-facing (“Sync recent mail”) not worker-facing |
| **`RunResultBanner.tsx`** | **Summary line** + 3–4 stat chips; full stats + classifier in `<details>`; failed: human message + expandable technical error |
| **`ConnectedAccountCard.tsx`** | Horizontal layout on `sm+` (avatar | info | controls); softer metadata; disconnect as destructive ghost |
| **`ConnectedAccountsList.tsx`** | Grid `gap-4` on accounts page; error banner styling consistency |
| **`EmailActivityTable.tsx`** | `variant: 'full' \| 'preview'`; merged sender/subject column; action chips; toolbar/body split; sticky header |
| **`HistoryTable.tsx`** | Pass `variant="preview"`, `maxRows={10}` |
| **`CategoryPill.tsx`** | Slightly tighter `sm` size; ensure contrast AA on all category colors |
| **`StatusBadge.tsx`** | Optional `size="sm"` with smaller dot; map run statuses to softer palette on classifier card |
| **`FilterTabs.tsx`** | Inactive = outline pills; reduce height slightly on Activity toolbar |
| **`SearchInput.tsx`** | Softer background `bg-zinc-50`; align height with filter row |
| **`UndoActionButton.tsx`** | Compact variant for table density; keep 44px touch target via padding wrapper |
| **`EmptyState.tsx`** | Variant prop: `hero` (Overview) vs `inline` (table) |
| **`overview/page.tsx`** | Full recomposition per §3; accounts snapshot; preview limit; connect banners into consistent alert component |
| **`activity/page.tsx`** | Header typography; pass any new table props |

### New components (minimal)

| Component | Purpose |
|-----------|---------|
| **`RunResultSummary.tsx`** (optional extract) | Parsed summary + details from `RunResultBanner` |
| **`OverviewAccountsSnapshot.tsx`** | Conditional compact accounts block |
| **`PageHeader.tsx`** (optional) | Shared title + description for dashboard sections |
| **`AlertBanner.tsx`** | Connect success/error banners (replace inline divs on Overview) |

Only introduce when a page imports them — no speculative library expansion.

---

## 7. Styling and Tokens

### Use existing tokens (no new framework)

Components should prefer semantic tokens from `globals.css` over raw `zinc-*` where it improves hierarchy:

| Token | Use |
|-------|-----|
| `--surface-base` | App background (`AppShell` main area) |
| `--surface-1` | Primary cards (metrics hero, table shell) |
| `--surface-2` | Toolbar strips, nested regions |
| `--text-primary` / `--text-secondary` / `--text-muted` | Type hierarchy |
| `--accent` / `--accent-hover` | Primary buttons, active nav accent |

### Recommended adjustments (`globals.css`)

- Add `--border-subtle: color-mix(in oklab, var(--foreground) 8%, transparent)` or fixed zinc equivalent for lighter card borders.
- Add `--radius-card: 0.75rem` and `--radius-pill: 9999px` in `@theme` for consistency (optional).
- Map Tailwind utilities: `bg-surface-1`, `text-text-muted` — use in refactored components incrementally.

### Typography scale

| Role | Classes (light touch) |
|------|---------------------|
| Page title | `text-lg font-semibold tracking-tight` |
| Section title | `text-base font-semibold` |
| Card title | `text-sm font-medium` |
| Hero metric | `text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight` |
| Supporting | `text-sm text-text-muted` |
| Table header | **Sentence case** `text-xs font-medium text-zinc-500` — drop `uppercase tracking-wide` |

### Surfaces & borders

- Default card: `border border-zinc-200/80 dark:border-zinc-800/80` + `shadow-sm` on hero metrics only.
- Reduce double borders (table inside card already has outer border — toolbar separator uses `bg-surface-2` not another border).

### Category pills (`lib/categories.ts`)

- Slightly desaturate backgrounds for showcase calm; keep distinct hues.
- Add `ring-1 ring-inset ring-black/5 dark:ring-white/10` for definition without heaviness.

### Buttons

- **Primary:** `bg-indigo-600` — Run Sync on Overview only.
- **Secondary:** outline zinc — Connect Gmail stays dark/neutral per brand choice.
- **Ghost:** sign out, dismiss, disclosure toggles.

### Focus states

- Keep shared `focusRing` from `lib/ui.ts`; verify ring-offset against `surface-1` backgrounds after token migration.

---

## 8. Implementation Phases

Each pass is one commit, `tsc` + `npm run lint` + `npm run build` before merge. No API or query contract changes except **Overview fetch limit** (smaller `limit` on existing `getEmailActivityPage` — same response shape).

---

### Phase 6A — Overview composition polish ✅ Complete

**Goals:** Rebalance Overview hierarchy; shorten activity preview; dedupe accounts block.

**Files likely touched:**
- `app/dashboard/overview/page.tsx`
- `lib/emailActivity.ts` — `OVERVIEW_ACTIVITY_PREVIEW_LIMIT = 10`
- `lib/dashboard/queries.ts` — `getEmailHistoryPreview(userId)` wrapping `getEmailActivityPage` with limit 10
- `components/OverviewMetricsGrid.tsx`, `components/ui/MetricCard.tsx`
- `components/EmailActivityTable.tsx` or `OverviewActivityPreview.tsx`
- `app/dashboard/HistoryTable.tsx`
- `components/OverviewAccountsSnapshot.tsx` (new)
- `components/ui/PageHeader.tsx` or inline header only on Overview

**Acceptance criteria:**
- [x] Overview shows **≤10** activity rows without search/filter/load-more UI
- [x] “View all activity” is visually prominent (button or styled link)
- [x] Full `ConnectedAccountsList` not rendered when account count > 2; snapshot + link instead
- [x] Metrics grid visibly larger/more spaced than other sections
- [x] Overview uses `getEmailHistoryPreview` with limit 10 (Activity page unchanged at 50)
- [x] No change to `/api/activity` or `/api/metrics`

**Risks:**
- Preview row count vs copy mismatch — keep copy in sync with constant
- Accounts snapshot logic edge cases (0, 1, 2, 3+)

**Manual checks:**
- [x] Overview with 0 / 1 / 3 accounts
- [x] Overview with 50+ history rows — only 10 shown
- [x] Click through to Activity — full table intact
- [x] Gmail `?connected=true` banner still visible

---

### Phase 6B — Run result / sync UI polish ✅ Complete

**Goals:** Replace debug-console sync UX with polished summary + disclosure.

**Files likely touched:**
- `components/RunSyncControl.tsx`
- `components/RunResultBanner.tsx` (+ optional `RunResultSummary.tsx`)
- `components/RunSyncButton.tsx`
- `components/ClassifierStatusCard.tsx` — reduce overlap with sync card classifier badge

**Acceptance criteria:**
- [x] Default sync card shows: title, CTA, compact status (pending/running/done/failed), **no live log scroller**
- [x] Activity log available under `<details>` / “View run details” when job active or after complete
- [x] Success result: **one summary sentence** + ≤4 stat chips; full numeric breakdown in disclosure
- [x] Failed result: user-friendly headline; raw `job.error` in disclosure/monospace
- [x] No user-facing `watch-jobs` in default view (modal subtitle reworded)
- [x] Polling, `router.refresh()` on complete, dismiss behavior unchanged
- [x] `aria-live` preserved on status region
- [x] Overview preview duplicate header fixed (sr-only thead; `aria-labelledby` on section title)

**Risks:**
- Hiding logs may frustrate power users — disclosure label must be clear
- Classifier badge duplication between cards — coordinate empty/active states (sync card badges removed from default view; `ClassifierStatusCard` unchanged)

**Manual checks:**
- [x] Queue sync from Overview; verify status updates without log noise (code review; live smoke on deploy)
- [x] Complete job → summary → expand details → dismiss
- [x] Failed job display
- [x] Dry run badge still visible
- [x] Demo mode mutations still blocked (unchanged)

---

### Phase 6C — Activity table density and rhythm ✅ Complete

**Goals:** Email-client readability on full Activity page; toolbar/table visual separation.

**Files likely touched:**
- `components/EmailActivityTable.tsx` (`ActivityDesktopRow`, `ActivityMobileRow`)
- `components/ui/FilterTabs.tsx`, `components/ui/SearchInput.tsx`
- `components/ui/CategoryPill.tsx`, `components/UndoActionButton.tsx`
- `app/dashboard/activity/page.tsx`
- Optional: `lib/emailActivity.ts` — `parseActionsTaken()` for action chips (display helper only)

**Acceptance criteria:**
- [x] Desktop: merged message column (subject primary, sender secondary)
- [x] Sentence-case column headers
- [x] No forced `min-w-[44rem]` horizontal scroll at 1024px viewport
- [x] Undo remains visible per eligible row (not in dropdown)
- [x] Mobile card layout preserved
- [x] Load-more centered with “Showing X of Y”
- [x] Search + filter behavior unchanged
- [x] Pagination still uses existing API params

**Risks:**
- Action chip parsing from free-text `actions_taken` — fallback to truncated raw string
- Column merge may affect screen reader table structure — keep semantic cells, use `headers` attrs if needed

**Manual checks:**
- [x] Filter categories, search, load more, undo flow (build verified; live smoke on deploy)
- [x] 375px mobile cards (layout unchanged)
- [x] 1024px desktop without horizontal scroll (`table-fixed`, no min-width)
- [x] Undone row styling

---

### Phase 6D — Sidebar / TopBar identity polish

**Goals:** Product branding and navigation chrome worthy of a Flux showcase.

**Files likely touched:**
- `components/Sidebar.tsx`
- `components/TopBar.tsx`
- `components/AppShell.tsx`
- `app/dashboard/SignOutButton.tsx`
- Optional: `components/BrandMark.tsx` (inline SVG)

**Acceptance criteria:**
- Sidebar: mark + wordmark + tagline; refined active/hover states; user footer on desktop
- TopBar: cleaner title treatment; mobile brand visible; sign-out not duplicated awkwardly on desktop
- Run Sync **not** added to TopBar as global executor (link-to-overview optional)
- Mobile drawer: branding matches desktop; Escape/scroll lock still work
- All nav links and skip link still pass keyboard audit

**Risks:**
- Moving sign-out may confuse existing users — keep one obvious sign-out path per viewport
- Sidebar footer may crowd small viewports — collapse email to first char + domain

**Manual checks:**
- Tab through nav, sign out, drawer open/close
- `lg` breakpoint: sidebar vs mobile
- Active route highlighting on all four dashboard routes

---

### Phase 6E — Mobile and final visual QA

**Goals:** Cross-viewport consistency, token adoption sweep, empty/alert polish.

**Files likely touched:**
- `app/globals.css` — border-subtle, token utility usage
- `components/ui/EmptyState.tsx`, `components/AccountsEmptyState.tsx`
- `app/dashboard/overview/page.tsx` — `AlertBanner` for connect messages
- `components/ConnectedAccountCard.tsx` — horizontal layout polish
- Any remaining high-traffic components with harsh `uppercase` or ops copy

**Acceptance criteria:**
- Overview scroll length reduced on mobile vs pre-6A baseline (qualitative)
- Empty states differentiated (`hero` vs `inline`)
- Connect success/error banners match design system
- `prefers-reduced-motion` still respected
- Touch targets ≥44px on primary controls
- No new accessibility regressions (manual spot-check Lighthouse a11y ≥90 on Overview)

**Risks:**
- Token migration partial — document remaining `zinc-*` as acceptable debt
- Scope creep into Settings page content — Settings stays stub

**Manual checks:**
- Full Section 8 matrix from original UI plan (Gmail connect, sync, undo, pagination, sign out)
- Dark mode on all dashboard routes
- Demo mode banner + fixture data still correct

---

## 9. Guardrails

Do **not**:

- Change Gmail OAuth routes or callbacks (`app/auth/google/*`)
- Change `/api/run`, `/api/undo`, `/api/accounts/*`, `/api/metrics`, `/api/activity` **response shapes or mutation behavior**
- Change Flux schema or runner configuration
- Fake or hardcode metrics
- Hide undo behind a dropdown or overflow menu
- Mix demo and real data paths (`lib/demo.ts`, `lib/demo/guard.ts` untouched)
- Rewrite `AppShell` routing or dashboard route structure
- Add shadcn, Radix, MUI, or other UI frameworks
- Add Framer Motion or heavy animation (opacity-only transitions OK)
- Reduce accessibility (focus rings, `aria-live`, switch semantics, table captions, skip link)
- Promote Run Sync to global TopBar **without** a documented cross-route refresh strategy

**Allowed:**

- Smaller `limit` on Overview server fetch (same `ProcessedEmailRow` shape)
- Client-side display parsers (`parseActionsTaken`, relative dates) that do not alter stored data
- Copy changes, CSS/Tailwind, component composition, `<details>` disclosure for logs/stats
- New presentational components listed in §6

---

## 10. Final Recommendation

**Phases 6A–6C are complete.** Next up: **Phase 6D — Sidebar / TopBar identity polish.**

**6E** (mobile/token sweep) follows after shell branding.

**Recommended order (remaining):** **6D → 6E**

Defer **TopBar Run Sync promotion** until a follow-up plan defines `RunSyncProvider` (or equivalent) in `AppShell` with unchanged API polling and explicit `router.refresh()` scope — out of Phase 6 unless the user explicitly expands scope.

---

*Related: [`mailpilot-ui-upgrade-plan.md`](mailpilot-ui-upgrade-plan.md) · [`BACKLOG.md`](../BACKLOG.md) (stale activity when sync runs off-dashboard)*
