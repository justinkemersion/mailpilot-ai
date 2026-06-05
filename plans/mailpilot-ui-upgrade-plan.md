# MailPilot UI Upgrade Plan
> Upgrading from a functional internal dashboard to a polished Flux showcase app.
> Status: Complete — Phases 1A–5 implemented.

---

## 1. Current-State Audit

### What exists today

The web app (`mailpilot-web/`) is a **minimal Next.js 16.2 / React 19 surface** with exactly two user-facing pages and five co-located components. There is no `components/` library, no `dashboard/layout.tsx`, and no multi-route navigation inside the dashboard.

**File tree (UI-relevant):**
```
mailpilot-web/
├── app/
│   ├── layout.tsx                        # Root layout: Geist fonts, SessionProvider
│   ├── page.tsx                          # Redirect only
│   ├── globals.css                       # Tailwind v4 @import + 2 CSS vars
│   ├── providers.tsx                     # NextAuth SessionProvider
│   ├── login/
│   │   ├── page.tsx                      # Auth gate + CSRF bootstrap
│   │   └── LoginForm.tsx                 # Centered card: GitHub + Google sign-in
│   ├── dashboard/
│   │   ├── page.tsx                      # Single server page: all dashboard content
│   │   ├── ConnectedAccountsList.tsx     # Account cards, toggle, disconnect
│   │   ├── HistoryTable.tsx              # Filterable email history, mobile cards
│   │   ├── RunSyncControl.tsx            # Manual sync card, job polling, results
│   │   └── SignOutButton.tsx             # Client sign-out
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── login/bootstrap/route.ts
│   │   ├── run/route.ts                  # POST create job / GET poll job
│   │   ├── undo/route.ts                 # POST undo Gmail action
│   │   └── accounts/[id]/route.ts        # PATCH toggle / DELETE disconnect
│   └── auth/
│       ├── google/route.ts               # Start Gmail OAuth
│       └── google/callback/route.ts      # Complete Gmail OAuth → upsert account
├── lib/
│   ├── flux/client.ts                    # PostgREST client (production data layer)
│   ├── auth/options.ts                   # NextAuth config
│   ├── formatClassifier.ts              # classifierLabel() from run result
│   └── formatMailpilotDate.ts           # UTC date formatting
└── (no components/ directory)
```

**Stack:**
- Next.js 16.2, React 19, TypeScript
- Tailwind CSS v4 (CSS-first config via `@theme inline` in `globals.css`, no `tailwind.config.ts`)
- `lucide-react` ^1.7.0 — only icon library
- NextAuth v4 (JWT sessions, GitHub + Google sign-in)
- Flux/PostgREST as data layer (no Prisma/Drizzle/Supabase ORM in use at runtime)
- No shadcn/ui, no Radix UI, no Headless UI, no Framer Motion

**What works:**
- Gmail OAuth connection flow (separate from login) — robust, must be preserved unchanged
- Account enable/disable toggle and disconnect
- Manual sync via `run_jobs` queue + worker polling
- Email history table with category filter pills and undo
- Responsive: mobile card list / desktop table split at `lg:` (1024px)
- Dark mode via `prefers-color-scheme`

**What feels raw:**
- **No persistent layout shell** — no sidebar, no consistent navigation chrome; everything is one long scrolling page
- **No overview/metrics area** — the user lands straight into account cards with no summary of what's happening
- **Typography and font inconsistency** — `body` in `globals.css` sets `Arial`, overriding the Geist fonts that are loaded but not applied globally
- **Only two token variables** (`--background`, `--foreground`) — all colors are inline utility classes with no semantic naming
- **RunSyncControl** is a dense card+modal combining status, options, live log, and results — needs decomposition
- **HistoryTable** is a single monolithic component (~300 lines) mixing filter state, rendering logic, and undo calls
- **ConnectedAccountsList** is functional but lacks account health signals, last-sync time, or error states
- **Empty states** are minimal dashed-border placeholders
- **No loading skeletons** — transitions between states feel abrupt
- **Pagination** is missing — history is hard-capped at 50 rows with no way to see more
- **No search** on email history
- **Header** is minimal: just the word "MailPilot" + user email + sign out — no product identity or primary action

---

## 2. Product UX Goals

### What should the user understand in the first 5 seconds?
- "MailPilot is running and keeping my email organized."
- How many emails were processed in the last cycle.
- Whether all connected accounts are healthy.
- The name of the AI classifier that did the work.

### What actions should be prominent?
1. **Run sync now** — the primary manual action; should be one click, always visible
2. **Connect a Gmail account** — onboarding action when no accounts exist
3. **Undo a recent action** — recovery should be discoverable, not buried in a table cell
4. **Enable/disable an account** — settings-level action, secondary prominence

### What information should be summarized, not buried?
- Total processed / archived / labeled counts (aggregate, not just last-run)
- Which AI model and provider is active
- Last sync time and outcome per account
- Category distribution across recent history

### How should MailPilot feel as a Flux showcase?
- **Calm and trustworthy** — the system is working quietly in the background; no alarm or noise
- **Technically credible** — shows classifier identity, run counts, model info; feels like it knows what it's doing
- **Personally useful** — clearly a tool for a real person's inbox, not a generic SaaS demo
- **Visually refined** — Linear-level information density, Vercel-level restraint; no decorative clutter
- **Honest about data** — all displayed metrics are real; no fake animations or synthetic accuracy scores

---

## 3. Proposed Information Architecture

### Navigation structure

```
/dashboard                → redirect to /dashboard/overview
/dashboard/overview       → Summary metrics + account health + classifier status + quick-run
/dashboard/accounts       → Full account management (connect, toggle, disconnect)
/dashboard/activity       → Email history with search, filter, pagination, undo
/dashboard/settings       → Stub: AI config info, runner env summary (read-only for now)
/login                    → Unchanged
/auth/google              → Unchanged (Gmail OAuth connect flow)
```

**Recommendation: introduce real routes from Phase 1.** Add `app/dashboard/layout.tsx` as the persistent shell (sidebar + topbar). Redirect `/dashboard` to `/dashboard/overview`. Each section becomes its own `page.tsx` under `dashboard/`. This is clean, predictable, and avoids scroll-to-section hacks — and makes each page independently linkable for a showcase.

### Sidebar items

| Label | Route | Icon | Notes |
|-------|-------|------|-------|
| Overview | `/dashboard/overview` | `LayoutDashboard` | Primary landing |
| Accounts | `/dashboard/accounts` | `Mail` | Account cards |
| Activity | `/dashboard/activity` | `Clock` | History table |
| Settings | `/dashboard/settings` | `Settings` | Stub in Phase 1 |

### Navigation behavior
- Sidebar: fixed left, `w-56` desktop; bottom sheet or hamburger on mobile
- Active route: highlighted with `bg-zinc-800` + `text-white` pill
- `Run Sync` button lives in the sidebar or top bar — always one click away

---

## 4. Visual Design System

### Design principles
- **Dark-first** — primary showcase surface is dark mode; light mode remains fully functional
- **Zinc neutrals** — main surface palette; no unnecessary color except for semantic signals
- **Indigo accent** — single action color; all primary interactive elements
- **Category colors** — the only decorative palette; consistent pill system

### Color tokens (extend `globals.css` `@theme inline`)

```css
@theme inline {
  /* Surfaces */
  --color-surface-base:    #09090b;   /* zinc-950 */
  --color-surface-1:       #18181b;   /* zinc-900 — cards, sidebar */
  --color-surface-2:       #27272a;   /* zinc-800 — elevated panels, hover */
  --color-surface-3:       #3f3f46;   /* zinc-700 — borders, dividers */

  /* Text */
  --color-text-primary:    #fafafa;   /* zinc-50 */
  --color-text-secondary:  #a1a1aa;   /* zinc-400 */
  --color-text-muted:      #71717a;   /* zinc-500 */

  /* Accent */
  --color-accent:          #6366f1;   /* indigo-500 */
  --color-accent-hover:    #4f46e5;   /* indigo-600 */

  /* Semantic */
  --color-success:         #10b981;   /* emerald-500 */
  --color-warning:         #f59e0b;   /* amber-500 */
  --color-danger:          #ef4444;   /* red-500 */
  --color-info:            #3b82f6;   /* blue-500 */
}
```

Light mode equivalents: surfaces invert to zinc-50/white/zinc-100; text inverts to zinc-900/700/500.

### Dark-mode surface hierarchy

```
Page background  → zinc-950  (--color-surface-base)
Sidebar          → zinc-900  (--color-surface-1)
Cards / panels   → zinc-900  (--color-surface-1)
Elevated / hover → zinc-800  (--color-surface-2)
Borders          → zinc-800  (subtle) or zinc-700 (dividers)
Inputs           → zinc-900 bg, zinc-700 border
```

### Border / radius / shadow conventions

| Context | Radius | Shadow |
|---------|--------|--------|
| Cards | `rounded-xl` | `shadow-sm` dark; `shadow-none` darker |
| Buttons (primary) | `rounded-lg` | none |
| Buttons (small/icon) | `rounded-md` | none |
| Pills / badges | `rounded-full` | none |
| Sidebar | `rounded-none` | `border-r border-zinc-800` |
| Modal / dialog | `rounded-2xl` | `shadow-xl` |
| Inputs | `rounded-lg` | none |
| Metric cards | `rounded-xl` | `ring-1 ring-zinc-800` |

No custom radius tokens needed — Tailwind defaults cover this.

### Typography scale

| Role | Class |
|------|-------|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section heading | `text-base font-semibold` |
| Card heading | `text-sm font-medium` |
| Body | `text-sm` (14px) |
| Caption / meta | `text-xs text-zinc-500` |
| Mono (IDs, counts, dates) | `font-mono text-xs` |
| Metric number | `text-3xl font-semibold tabular-nums` |

Fix: replace `font-family: Arial` in `globals.css` `body` rule with `font-family: var(--font-sans)`.

### Category pill colors

These already exist in `HistoryTable.tsx` — formalize as shared constants:

| Category | Pill (dark) | Dot color |
|----------|------------|-----------|
| important | `bg-blue-950 text-blue-300 ring-blue-800` | `blue-400` |
| work | `bg-indigo-950 text-indigo-300 ring-indigo-800` | `indigo-400` |
| personal | `bg-violet-950 text-violet-300 ring-violet-800` | `violet-400` |
| newsletters | `bg-amber-950 text-amber-300 ring-amber-800` | `amber-400` |
| promotions | `bg-orange-950 text-orange-300 ring-orange-800` | `orange-400` |
| receipts | `bg-teal-950 text-teal-300 ring-teal-800` | `teal-400` |
| spam | `bg-red-950 text-red-300 ring-red-800` | `red-400` |

Light mode uses same hue, `50`/`700` pairing.

### Status colors

| Status | Color |
|--------|-------|
| `done` / healthy / enabled | `emerald-500` |
| `running` / syncing | `indigo-500` + spin animation |
| `pending` | `amber-500` |
| `failed` / error / disabled | `red-500` |
| `undone` | `zinc-500` strikethrough |

### Button variants

| Variant | Class pattern |
|---------|--------------|
| Primary | `bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg` |
| Secondary | `bg-zinc-800 text-zinc-100 hover:bg-zinc-700 rounded-lg` |
| Ghost | `text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg` |
| Danger | `bg-red-950 text-red-400 hover:bg-red-900 rounded-lg` |
| Icon | `h-9 w-9 inline-flex items-center justify-center rounded-md` |

All interactive elements: `min-h-11` for touch targets, `focus-visible:ring-2 focus-visible:ring-indigo-500`.

### Card styles

```
rounded-xl bg-zinc-900 ring-1 ring-zinc-800 p-4 sm:p-6
```

Metric cards: same + `flex flex-col gap-1`.
Elevated (hover/active): `bg-zinc-800`.

### Table / list styles

- Table: `w-full text-sm`, `thead` `text-xs text-zinc-500 uppercase tracking-wide border-b border-zinc-800`
- Row: `border-b border-zinc-800/50 hover:bg-zinc-900/50`
- No zebra striping
- Mobile: card-per-row below `lg:` breakpoint (preserve existing pattern)

### Empty / loading / error states

- **Empty:** Icon (muted) + heading + subtext + CTA button; centered in card
- **Loading skeleton:** `animate-pulse bg-zinc-800 rounded` blocks at expected content dimensions; not spinners
- **Error:** Red-tinted card with message + retry button; never a raw error string to the user

---

## 5. Component Architecture

All new shared components live in `mailpilot-web/components/`. Route-specific components stay co-located in their `app/dashboard/*/` directory.

### Utility (add immediately in Phase 1)

**`lib/utils.ts`** — `cn()` helper (`clsx` + `tailwind-merge`). One small dependency, eliminates string concatenation throughout.

**`lib/categories.ts`** — canonical category color map and label formatter (extracted from `HistoryTable.tsx`).

### Shell

**`components/AppShell.tsx`** (Server Component)
- Props: `children`
- Composes `Sidebar` + `TopBar` + `<main>` content area
- Used by `app/dashboard/layout.tsx`

**`components/Sidebar.tsx`** (Client Component — needs `usePathname`)
- Props: `navItems: NavItem[]`, `userEmail: string`
- Renders logo, nav links with active state, `RunSyncButton` shortcut at bottom
- Collapses to icon-only on hover, or hidden on mobile with a toggle

**`components/TopBar.tsx`** (Server Component)
- Props: `title: string`, `actions?: ReactNode`
- Right side: user email chip + `SignOutButton`
- Mobile: hamburger to open sidebar drawer

### Primitives

**`components/ui/MetricCard.tsx`**
- Props: `label: string`, `value: string | number`, `delta?: string`, `icon?: LucideIcon`, `status?: "neutral" | "success" | "warning" | "danger"`
- Used in Overview dashboard grid

**`components/ui/StatusBadge.tsx`**
- Props: `status: "pending" | "running" | "done" | "failed" | "disabled" | "enabled"`
- Renders colored dot + label
- Used in account cards, run status

**`components/ui/CategoryPill.tsx`**
- Props: `category: string`, `size?: "sm" | "md"`
- Color from `lib/categories.ts` map
- Used in HistoryTable rows and filter tabs

**`components/ui/LoadingSkeleton.tsx`**
- Props: `rows?: number`, `variant?: "table" | "card" | "metric"`
- Animated pulse placeholder at expected content size

**`components/ui/EmptyState.tsx`**
- Props: `icon: LucideIcon`, `title: string`, `description: string`, `action?: { label: string; href?: string; onClick?: () => void }`
- Used in empty accounts, empty history, post-undo

**`components/ui/SearchInput.tsx`**
- Props: `value: string`, `onChange: (v: string) => void`, `placeholder?: string`
- Controlled input with `Search` lucide icon, clear button

**`components/ui/FilterTabs.tsx`**
- Props: `options: { value: string; label: string; count?: number }[]`, `value: string`, `onChange: (v: string) => void`
- Horizontal scrollable pill tabs; used for category filter in ActivityTable

### Feature components

**`components/ConnectedAccountCard.tsx`** (Client Component)
- Props: `account: AccountRow`, `onToggle: (id, enabled) => void`, `onDisconnect: (id) => void`
- Renders: avatar initials, email, `StatusBadge`, `processing_enabled` toggle, disconnect button
- Replaces the row-within-grid pattern in current `ConnectedAccountsList`

**`components/ClassifierStatusCard.tsx`** (Server Component or data-passed)
- Props: `aiLabel: string`, `aiProvider: string`, `aiModel: string`, `lastRunAt: string | null`, `llmCalls: number`, `processed: number`
- Read-only info card: model identity + last run summary
- Source: `run_jobs.result` from last completed job

**`components/RunSyncButton.tsx`** (Client Component — extracted from `RunSyncControl`)
- Props: `initialJobStatus?: RunJobRow`
- Single-click trigger; shows spinner when running; opens settings sheet on long-press or secondary action
- Polls job status; emits `onComplete(result)` for parent refresh

**`components/RunResultBanner.tsx`** (Client Component)
- Props: `result: RunJobResult`, `onDismiss: () => void`
- Shows post-run summary: processed/archived/labeled counts, AI limit warning if hit
- Replaces the results section inside `RunSyncControl`

**`components/EmailActivityTable.tsx`** (Client Component — refactor of `HistoryTable`)
- Props: `initialRows: ProcessedEmailRow[]`, `accounts: AccountSummary[]`
- Manages: search state, category filter, pagination offset (fetch more)
- Sub-renders: `FilterTabs`, `SearchInput`, row list, `UndoActionButton`
- Keeps mobile card / desktop table split

**`components/UndoActionButton.tsx`** (Client Component — extracted from `HistoryTable`)
- Props: `processedEmailId: number`, `actionsToken: string`, `wasArchived: boolean`, `onSuccess: () => void`
- Inline undo affordance per row; confirms eligibility before calling `/api/undo`

**`components/OverviewMetricsGrid.tsx`** (Server Component)
- Props: `metrics: OverviewMetrics`
- 4-card grid: emails processed (total), archived, labeled, accounts active
- Data derived server-side at page load

---

## 6. Data Mapping

### Currently available and ready to display

| UI element | Source | Field(s) | Availability |
|------------|--------|----------|--------------|
| Connected accounts list | `api.accounts` | `id, email, display_name, processing_enabled, active` | Available now |
| Account health / enabled badge | `api.accounts` | `processing_enabled` | Available now |
| Email history rows | `api.processed_emails` | All selected fields | Available now (50 rows) |
| Category filter | `api.processed_emails` | `category` | Available now |
| Undo eligibility | `api.processed_emails` | `actions_taken`, `was_archived`, `applied_label_names` | Available now |
| Last run status | `api.run_jobs` | `status`, `completed_at`, `result`, `error` | Available now |
| AI classifier identity | `api.run_jobs.result` | `ai_provider`, `ai_model`, `ai_label` | Available now |
| Run summary counts | `api.run_jobs.result` | `processed`, `archived`, `labels_applied`, `llm_calls`, `prefiltered` | Available now |
| AI limit warning | `api.run_jobs.result` | `ai_limit_hit`, `ai_limit_message` | Available now |
| Live run progress | `api.run_jobs` | `progress.phase`, `progress.message` | Available now (via polling) |

### Derivable with new API routes (no schema changes)

| UI element | How to derive | New endpoint needed |
|------------|---------------|---------------------|
| Total emails processed (all time) | `COUNT(*)` on `processed_emails` WHERE `user_id` | Add to dashboard server fetch or new `/api/metrics` route |
| Total archived | `COUNT(*) WHERE was_archived = true` | Same |
| Category breakdown (counts) | `GROUP BY category` on `processed_emails` | Same |
| Last sync time per account | `MAX(processed_at) WHERE account_id = ?` | Group in same query |
| Run history (more than latest) | `SELECT * FROM run_jobs ORDER BY created_at DESC LIMIT N` | New `/api/runs` route |
| Paginated history | `processed_emails` with `LIMIT/OFFSET` or cursor | Extend `dashboard/page.tsx` or new API route |

These require **new Flux queries only** — no schema changes.

### Not available without runner changes (defer)

| Metric | Missing because | Proposal |
|--------|----------------|----------|
| Per-email confidence score | Not written to `processed_emails` | Defer; add `confidence float` column if desired post-Phase 3 |
| Per-email classification reason | Not written to DB | Defer; add `reason text` column optionally |
| Noise flag per email | Not written to DB | Defer |
| Ground-truth accuracy | No evaluation pipeline | Do not fake; label as "not available" if referenced |
| Accounts needing reauth | Not in `run_jobs.result` | Defer; runner would need to surface this |

**Hard rule:** do not display fake or synthetic metrics anywhere in production code paths.

---

## 7. Implementation Phases

### Phase 1A — Safe Routing Extraction ✅ Approved

**Goals:** Introduce dashboard subroutes without changing product behavior or redesigning the UI. The riskiest structural change (redirecting `/dashboard`) is isolated and verified before any visual work begins.

**Scope (strict):**
- Add `/dashboard/overview`, `/dashboard/accounts`, `/dashboard/activity`, `/dashboard/settings`
- `/dashboard/page.tsx` redirects to `/dashboard/overview` via `next/navigation` `redirect()`
- Current dashboard content moves into `/dashboard/overview/page.tsx` with **minimal visual changes**
- Accounts page reuses existing `ConnectedAccountsList.tsx` as-is
- Activity page reuses existing `HistoryTable.tsx` as-is
- `app/dashboard/layout.tsx` added as a **passthrough only** — no shell, sidebar, or styling yet
- No new components, no new API routes, no styling changes, no demo mode

**Out of scope for Phase 1A:**
- AppShell, Sidebar, TopBar — deferred to Phase 1B
- Font fix, token variables — deferred to Phase 1B
- `cn()`, `lib/categories.ts`, shared primitives — deferred to Phase 1B
- Global Run Sync button — deferred to Phase 2+
- Metrics — deferred to Phase 2+
- Demo mode — deferred to Phase 5

**Files touched / created:**
- `mailpilot-web/app/dashboard/page.tsx` — change to `redirect("/dashboard/overview")`
- `mailpilot-web/app/dashboard/layout.tsx` — **new** passthrough (`export default function Layout({ children }) { return children }`)
- `mailpilot-web/app/dashboard/overview/page.tsx` — **new** — copy of current `dashboard/page.tsx` content
- `mailpilot-web/app/dashboard/accounts/page.tsx` — **new** — thin server page with `ConnectedAccountsList` and connect button
- `mailpilot-web/app/dashboard/activity/page.tsx` — **new** — thin server page with `HistoryTable`
- `mailpilot-web/app/dashboard/settings/page.tsx` — **new stub** — placeholder only

**Acceptance criteria:**
- `/dashboard` redirects to `/dashboard/overview`; no auth loop
- `/dashboard/overview` renders identically to the old `/dashboard`
- `/dashboard/accounts` renders the accounts section
- `/dashboard/activity` renders the history table with filters and undo
- Direct navigation to all four subroutes works
- Unauthenticated access to subroutes redirects to `/login` (middleware wildcard covers `:path*`)
- Gmail connect flow unchanged: `/auth/google` → callback → `/dashboard/overview?connected=true`
- Run Sync, account toggle, disconnect, undo all work from their new page locations
- `tsc --noEmit` passes; `eslint` passes
- No behavior change visible to the user

**Risks:**
- `/dashboard/page.tsx` redirect must not loop: middleware `withAuth` redirects unauthenticated users to `/login`, not back to `/dashboard`, so the chain is safe — but verify manually
- The Gmail callback redirects to `/dashboard?connected=true`; after Phase 1A this will follow the `/dashboard` → `/dashboard/overview` redirect, carrying the query param. Verify the flash banner still appears in `overview/page.tsx`

---

### Phase 1B — Shell and Visual Foundation

**Goals:** Persistent shell, layout infrastructure, design tokens, shared primitives. Runs after Phase 1A is verified. No behavior changes — purely structural and visual layering.

**Files likely touched / created:**
- `mailpilot-web/app/globals.css` — add token variables, fix `body` font (`font-family: var(--font-sans)`)
- `mailpilot-web/app/dashboard/layout.tsx` — replace passthrough with `AppShell`
- `mailpilot-web/components/AppShell.tsx` — new
- `mailpilot-web/components/Sidebar.tsx` — new
- `mailpilot-web/components/TopBar.tsx` — new
- `mailpilot-web/components/ui/EmptyState.tsx` — new (only if a page needs it)
- `mailpilot-web/components/ui/LoadingSkeleton.tsx` — new (only if a page needs it)
- `mailpilot-web/components/ui/StatusBadge.tsx` — new (only if a page needs it)
- `mailpilot-web/components/ui/CategoryPill.tsx` — new (extracted from `HistoryTable` when it's first used)
- `mailpilot-web/lib/utils.ts` — add `cn()` (add `clsx` + `tailwind-merge`)
- `mailpilot-web/lib/categories.ts` — new (category color/label constants)

**Component creation rule:** only create a primitive when a Phase 1B page or component actually imports it. Do not pre-create the full library.

**Acceptance criteria:** same as Phase 1A plus sidebar renders on all `/dashboard/*` routes with active link highlighted.

---

### Phase 2 — Overview Dashboard

**Goals:** Summary metrics, connected account cards redesign, classifier status panel, improved run sync experience.

**Run Sync button placement rule:**
- **Phase 2:** `RunSyncButton` lives on the Overview page only (or optionally in the TopBar as a secondary action). It does not live in the persistent Sidebar yet.
- **Phase 3 or 4:** Promote `RunSyncButton` to the global TopBar once post-run refresh behavior is clean across all three route pages (Overview, Accounts, Activity).

**Metrics label rule:** Label metric cards conservatively. Use `"Processed recently"`, `"Archived recently"`, `"Labeled recently"` unless the `/api/metrics` endpoint truly queries all-time counts. Do not use `"All time"` until that is confirmed by the implementation. Never show a hardcoded fallback value — show `—` or a skeleton.

**Files likely touched / created:**
- `mailpilot-web/app/dashboard/overview/page.tsx` — add metrics fetch, compose new components
- `mailpilot-web/app/dashboard/accounts/page.tsx` — use `ConnectedAccountCard`
- `mailpilot-web/components/OverviewMetricsGrid.tsx` — new
- `mailpilot-web/components/ui/MetricCard.tsx` — new
- `mailpilot-web/components/ConnectedAccountCard.tsx` — new (replaces inline in `ConnectedAccountsList`)
- `mailpilot-web/components/ClassifierStatusCard.tsx` — new
- `mailpilot-web/components/RunSyncButton.tsx` — extracted/refactored from `RunSyncControl`
- `mailpilot-web/components/RunResultBanner.tsx` — new
- `mailpilot-web/app/api/metrics/route.ts` — **new** — aggregate counts from `processed_emails`

**New API: `GET /api/metrics`**
Returns for the authenticated user:
```ts
{
  total_processed: number;
  total_archived: number;
  total_labeled: number;
  by_category: Record<string, number>;
  active_accounts: number;
}
```
Single Flux query with `GROUP BY` aggregation; no schema change needed.

**Acceptance criteria:**
- Overview shows metric cards with real data and conservative `"recently"` labels
- Account cards show email, processing status, last-sync derived from history
- Classifier card shows AI provider, model, last run time
- Run Sync button visible on Overview; runs correctly end-to-end
- `RunResultBanner` appears after job completes; dismissible
- Empty state shown when zero accounts connected

**Risks:**
- Metric query performance — `processed_emails` may grow large; ensure `user_id` index exists (check schema)
- Account card "last synced" requires joining `processed_emails` MAX per account; keep it simple, can be null initially

---

### Phase 3 — Email Activity Redesign

**Goals:** Replace `HistoryTable.tsx` with a polished, searchable, paginated, filterable activity view.

**Files likely touched / created:**
- `mailpilot-web/app/dashboard/activity/page.tsx` — server fetch initial rows, pass to client
- `mailpilot-web/components/EmailActivityTable.tsx` — refactor of `HistoryTable`
- `mailpilot-web/components/UndoActionButton.tsx` — extracted from `HistoryTable`
- `mailpilot-web/components/ui/FilterTabs.tsx` — new
- `mailpilot-web/components/ui/SearchInput.tsx` — new
- `mailpilot-web/app/api/activity/route.ts` — **new** — paginated `processed_emails` query

**New API: `GET /api/activity?category=&search=&offset=&limit=`**
Replaces the hard-coded 50-row fetch in `dashboard/page.tsx`:
```ts
{
  rows: ProcessedEmailRow[];
  total: number;
  offset: number;
  limit: number;
}
```

**Search:** client-side filter on `subject` + `sender` for the loaded page; server-side for full search (Phase 3+).

**Acceptance criteria:**
- Category filter pills work; `All` default
- Search filters rows by subject/sender (client-side initially)
- "Load more" button fetches next page (not infinite scroll — explicit pagination)
- Undo button visible per row where eligible; fires correctly, row updates inline
- Mobile card view preserved
- Empty state shown when no matching rows

**Risks:**
- Undo inline update: after undo, the row should show `[UNDONE]` without a full page reload — use optimistic state update in `EmailActivityTable`
- Category "all" count in filter tab requires total row count per category — use `/api/metrics` response

---

### Phase 4 — Responsiveness and Polish

**Goals:** Mobile layout, empty/loading/error states, accessibility, reduced motion, final visual pass.

**Files likely touched:**
- All Phase 1–3 components
- `mailpilot-web/app/globals.css` — add `@media (prefers-reduced-motion: reduce)` to disable transitions
- `mailpilot-web/components/Sidebar.tsx` — mobile drawer behavior
- `mailpilot-web/components/ui/LoadingSkeleton.tsx` — apply to all async sections

**Accessibility checklist:**
- All interactive elements: `focus-visible:ring-2 focus-visible:ring-indigo-500`
- Toggle switches: `role="switch"`, `aria-checked`, keyboard Enter/Space support
- Tables: proper `<th scope>`, `<caption>` or `aria-label`
- Buttons: no icon-only buttons without `aria-label`
- Color contrast: verify category pills and status badges meet WCAG AA (4.5:1 for text)
- `aria-live="polite"` on run status updates and undo confirmation
- `prefers-reduced-motion`: disable transform animations, use opacity-only fallbacks

**Mobile behavior:**
- Sidebar: hidden by default on `< lg:`; toggle via hamburger in `TopBar`; overlay drawer, not push
- Metric grid: 2 columns on `sm:`, 4 on `lg:`
- Account cards: single column on mobile
- TopBar: compact — logo + hamburger only on mobile; user email truncated or hidden

**Acceptance criteria:**
- App is usable at 375px viewport width
- No horizontal scroll on any page
- All buttons meet 44px touch target
- Sidebar opens/closes correctly on mobile
- `prefers-reduced-motion` disables all transitions
- Lighthouse accessibility score ≥ 90 on Overview

---

### Phase 5 — Showcase Readiness

**Goals:** Demo posture, curated presentation, Flux marketing alignment.

**Demo mode (controlled pathway, never production default):**

Demo mode is controlled by a **server-only** environment variable:

```bash
MAILPILOT_DEMO_MODE=true
```

This variable is **never** prefixed `NEXT_PUBLIC_`. It must not be read by client components. The authority over whether real DB/Gmail calls are made stays server-side.

A separate `NEXT_PUBLIC_DEMO_BANNER=true` may be exposed to the client **only** to render a dismissible info strip — it controls UI posture, not data routing. The two vars can be set together but serve different concerns.

Behavior when `MAILPILOT_DEMO_MODE=true`:
- Server fetches (accounts, history, run jobs) return fixture data from `lib/demo.ts` instead of calling Flux
- All API routes that mutate (run, undo, accounts PATCH/DELETE) return `{ ok: false, error: "Demo mode" }` with HTTP 403
- The Gmail OAuth connect flow redirects to `/dashboard/overview?demo=true` instead of starting OAuth
- **Never intermingles with real user data**
- Must be absent or `false` in all production deployments — document this explicitly in deploy README

Implementation: `lib/demo.ts` fixture file + conditional in server-side page fetches and API route handlers. Fixture data is injected at the server boundary; no client component is aware of the data source.

**Showcase artifacts:**
- `/public/screenshots/` — curated screenshots for README/marketing
- `plans/` — this document and future iteration notes
- `README.md` update: clear description, setup instructions, demo link if deployed

**Files likely touched / created:**
- `mailpilot-web/lib/demo.ts` — fixture data (server-only)
- `mailpilot-web/app/dashboard/overview/page.tsx` — `MAILPILOT_DEMO_MODE` branch in server fetch
- `mailpilot-web/components/DemoBanner.tsx` — reads `NEXT_PUBLIC_DEMO_BANNER`, dismissible client strip

**Acceptance criteria:**
- `MAILPILOT_DEMO_MODE=true` renders with fixture data; no real Flux calls made; verified by checking network requests
- Mutating API routes return 403 in demo mode
- Real user flow completely unaffected when `MAILPILOT_DEMO_MODE` is absent
- Screenshots match actual running app

---

## 8. Testing and Verification

For each phase, run these checks before merging:

### Automated

```bash
# From mailpilot-web/
npx tsc --noEmit          # TypeScript check
npx next lint             # ESLint
```

### Manual functional flows

| Check | What to verify |
|-------|---------------|
| Gmail connect | `/auth/google` → consent → callback → `/dashboard/overview?connected=true` — no 404, account appears |
| Manual sync | Run Sync button → job created → polling → result banner → history updated |
| Multi-account | Connect 2 accounts; both visible in Accounts page; toggle one off → runner skips it |
| Undo | Find archived row → click undo → Gmail message restored → row shows `[UNDONE]` |
| Category filter | Select `newsletters` → only newsletter rows shown; `All` restores all |
| Search | Type sender name → rows filter; clear → restored |
| Pagination | Scroll to bottom of activity → "Load more" → next page appends |
| Disconnect account | Click disconnect → account removed; empty state if last account |
| Sign out | Click sign out → redirects to `/login`; revisiting `/dashboard` redirects to `/login` |
| Error state | Trigger a bad sync (no env configured) → `failed` status shown with message |

### Viewport checks

| Width | Checks |
|-------|--------|
| 375px (iPhone SE) | Sidebar hidden, hamburger visible, metric cards 2-col, history cards (not table) |
| 768px (iPad portrait) | Sidebar hidden or icon-only, layout functional |
| 1280px (desktop) | Full sidebar, metric cards 4-col, history table |

### State checks

| State | How to test |
|-------|------------|
| Zero accounts | Delete all accounts; verify empty state on Overview and Accounts pages |
| Empty history | New account with no processed emails; verify empty state in Activity |
| Failed sync | Kill the runner; queue a job; wait for stale reap (15 min) or manually update `run_jobs.status = 'failed'` in DB |
| Unauthenticated | Clear session cookie; verify redirect to `/login` from all `/dashboard/*` routes |
| Dark mode | Toggle OS dark mode; verify all surfaces and pills render correctly |

---

## 9. Risks and Guardrails

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Breaking Gmail OAuth** | Changing `auth/google` routes or middleware patterns could break account connection | Route files `app/auth/google/route.ts` and `/callback/route.ts` are **read-only** in all phases. Middleware `proxy.ts` is untouched. |
| **Auth loop in redirects** | `/dashboard/page.tsx` redirect to `/dashboard/overview` could interact with `withAuth` redirect logic | Use `redirect()` from `next/navigation` (not HTTP 301); test unauthenticated path before merging Phase 1 |
| **Mixing real and demo data** | `DEMO_MODE` fixture data leaking into real sessions | `MAILPILOT_DEMO_MODE` is server-only; gated at server fetch level, not per-component. API routes return 403 in demo mode. `NEXT_PUBLIC_DEMO_BANNER` controls only UI posture. Both vars absent in production. |
| **Fake metrics** | Over-eager dashboard numbers that don't reflect real data | All metric cards must show `—` or a skeleton when data is unavailable, never a hardcoded fallback value |
| **Hiding undo** | Redesigning the activity table in a way that buries the undo button | `UndoActionButton` is a dedicated visible component on each eligible row — not hidden in a dropdown |
| **Mobile regressions** | Adding a sidebar and new grid layout breaks mobile usability | Phase 4 is dedicated to mobile pass; test at 375px at the end of every phase |
| **Component churn** | Creating too many wrapper components before the screens need them | Only create a primitive when a page actually imports it. The full component list in §5 is a target inventory, not a creation checklist for Phase 1. |
| **Over-designing before data is ready** | Building a `ClassifierStatusCard` before the metrics API route exists | Phase ordering is strict: API routes precede UI components that depend on them |
| **Table usability regression** | Making the history table "look nicer" but reducing information density | Desktop table view is preserved; mobile card view is preserved; no columns are removed |
| **Font consistency** | Fixing the `Arial` body override could change line heights and layout measurements slightly | Fix in Phase 1 in isolation; verify login form and all cards for layout shift |
| **Tailwind v4 CSS-only config** | v4 has no JS config; any `@theme inline` changes affect all utilities | Stick to adding new tokens; do not rename or remove existing zinc/indigo utilities used in components |
| **PostgREST query limits** | New `/api/metrics` aggregate query may be slow on large `processed_emails` | Add `user_id` to WHERE clause (already filtered); Flux service token has direct DB access; add `?select=count,category&groupby=category` pattern only if supported, otherwise use raw aggregate in a separate RPC |

---

## 10. Final Recommendation

**Proceed with the upgrade in five phases as described.**

The foundation is solid. The app works correctly, the data model is clean, and the stack (Next.js 16 / React 19 / Tailwind v4 / Flux PostgREST) is production-ready. The upgrade is a **refactor and layering effort**, not a rewrite — every existing functional flow is preserved and the new shell is additive.

**Recommended starting point:** Phase 1A is the right first step — introducing subroutes without changing the UI ensures the redirect logic, auth flows, and query-param behavior (e.g. `?connected=true`) are verified clean before any visual work starts. Phase 1B follows immediately after and is the visual foundation. Together they are one logical phase in two safe commits.

**Defer:** per-email confidence scores, classification reasons, demo mode (Phase 5), and run history archive. None of these are needed to achieve a polished, production-quality Flux showcase. The existing real data — account health, category breakdowns, run counts, model identity, and undo — is more than sufficient to build a credible, useful dashboard.

**The app can feel like a premium personal productivity tool within Phases 1 and 2 alone.** Phases 3–5 are polish and depth. Start there.
