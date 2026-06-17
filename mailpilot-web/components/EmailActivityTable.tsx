"use client";

import { FilterTabs, type FilterTabOption } from "@/components/ui/FilterTabs";
import { CategoryPill } from "@/components/ui/CategoryPill";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  UndoActionButton,
  type UndoButtonState,
} from "@/components/UndoActionButton";
import {
  TeachActionMenu,
  type TeachButtonState,
} from "@/components/TeachActionMenu";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import { CATEGORY_ORDER } from "@/lib/categories";
import {
  EMAIL_ACTIVITY_PAGE_SIZE,
  isUndone,
  parseActionChips,
  parseSender,
  rowMatchesSearch,
  truncateText,
  type ProcessedEmailRow,
} from "@/lib/emailActivity";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

interface EmailActivityTableProps {
  initialRows: ProcessedEmailRow[];
  initialTotal: number;
  pageSize?: number;
  paginate?: boolean;
  variant?: "full" | "preview";
  labelledById?: string;
  categoryCounts?: Record<string, number>;
  totalCount?: number | null;
}

type UndoStateMap = Record<number, UndoButtonState>;
type TeachStateMap = Record<number, TeachButtonState>;

async function fetchActivityPage(params: {
  offset: number;
  limit: number;
  category: string | null;
}): Promise<{
  rows: ProcessedEmailRow[];
  total: number;
  offset: number;
  limit: number;
}> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.category) query.set("category", params.category);
  const res = await fetch(`/api/activity?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load activity (${res.status})`);
  }
  return (await res.json()) as {
    rows: ProcessedEmailRow[];
    total: number;
    offset: number;
    limit: number;
  };
}

export function EmailActivityTable({
  initialRows,
  initialTotal,
  pageSize = EMAIL_ACTIVITY_PAGE_SIZE,
  paginate = true,
  variant = "full",
  labelledById,
  categoryCounts = {},
  totalCount = null,
}: EmailActivityTableProps) {
  const isPreview = variant === "preview";
  const router = useRouter();
  const [rows, setRows] = useState<ProcessedEmailRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [undoState, setUndoState] = useState<UndoStateMap>({});
  const [teachState, setTeachState] = useState<TeachStateMap>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const rowsSyncKey = useMemo(
    () =>
      initialRows.map((r) => `${r.id}:${r.actions_taken ?? ""}`).join("|"),
    [initialRows]
  );

  useEffect(() => {
    if (isPreview || (!paginate && categoryFilter === "")) {
      setRows(initialRows);
      setTotal(initialTotal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync server rows when not paginating
  }, [rowsSyncKey, paginate, categoryFilter, isPreview]);

  const filterOptions = useMemo((): FilterTabOption[] => {
    const allCount = totalCount ?? total;
    const options: FilterTabOption[] = [
      {
        value: "",
        label: "All",
        count: allCount > 0 ? allCount : undefined,
      },
    ];
    for (const category of CATEGORY_ORDER) {
      const count = categoryCounts[category];
      if (count != null && count > 0) {
        options.push({ value: category, label: category, count });
      }
    }
    const extra = Object.keys(categoryCounts).filter(
      (c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number])
    );
    for (const category of extra.sort()) {
      const count = categoryCounts[category];
      if (count > 0) {
        options.push({ value: category, label: category, count });
      }
    }
    return options;
  }, [categoryCounts, total, totalCount]);

  const handleCategoryChange = useCallback(
    async (next: string) => {
      setCategoryFilter(next);
      setFetchError(null);
      if (!paginate) return;

      setLoadingCategory(true);
      try {
        const page = await fetchActivityPage({
          offset: 0,
          limit: pageSize,
          category: next || null,
        });
        setRows(page.rows);
        setTotal(page.total);
      } catch (err) {
        console.error("Failed to filter activity:", err);
        setFetchError(
          err instanceof Error ? err.message : "Could not load filtered emails."
        );
      } finally {
        setLoadingCategory(false);
      }
    },
    [paginate, pageSize]
  );

  const displayRows = useMemo(() => {
    let filtered = rows;
    if (!paginate && categoryFilter) {
      filtered = filtered.filter((r) => r.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      filtered = filtered.filter((r) => rowMatchesSearch(r, searchQuery));
    }
    return filtered;
  }, [rows, categoryFilter, searchQuery, paginate]);

  const hasMore = paginate && rows.length < total;

  async function handleLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setFetchError(null);
    try {
      const page = await fetchActivityPage({
        offset: rows.length,
        limit: pageSize,
        category: categoryFilter || null,
      });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const next = page.rows.filter((r) => !seen.has(r.id));
        return [...prev, ...next];
      });
      setTotal(page.total);
    } catch (err) {
      console.error("Failed to load more activity:", err);
      setFetchError(
        err instanceof Error ? err.message : "Could not load more emails."
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleTeach(
    row: ProcessedEmailRow,
    actionPolicy: "archive" | "never_archive"
  ) {
    setTeachState((s) => ({ ...s, [row.id]: "pending" }));
    try {
      const res = await fetch(`/api/messages/${row.id}/teach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_policy: actionPolicy }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        demo?: boolean;
        message?: string;
        summary?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setTeachState((s) => ({ ...s, [row.id]: "done" }));
      setStatusMessage(
        body.demo
          ? (body.message ?? "Demo teach simulated.")
          : (body.summary ?? "Preference saved for this mailbox.")
      );
      router.refresh();
    } catch (err) {
      console.error("Teach failed:", err);
      setTeachState((s) => ({ ...s, [row.id]: "error" }));
      setStatusMessage(
        err instanceof Error ? err.message : "Could not save preference."
      );
    }
  }

  async function handleUndo(row: ProcessedEmailRow) {
    setUndoState((s) => ({ ...s, [row.id]: "pending" }));
    try {
      const res = await fetch("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processed_email_id: row.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { demo?: boolean; message?: string };
      setUndoState((s) => ({ ...s, [row.id]: "done" }));
      setStatusMessage(
        body.demo
          ? (body.message ?? "Demo action simulated.")
          : `Gmail changes undone for “${row.subject ?? "message"}”.`
      );
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                actions_taken: ((r.actions_taken ?? "").trim() + " [UNDONE]").trim(),
              }
            : r
        )
      );
      router.refresh();
    } catch (err) {
      console.error("Undo failed:", err);
      setUndoState((s) => ({ ...s, [row.id]: "error" }));
      setStatusMessage("Undo failed. Please try again.");
    }
  }

  if (
    rows.length === 0 &&
    !loadingCategory &&
    (isPreview || (categoryFilter === "" && !searchQuery))
  ) {
    return (
      <EmptyState
        variant="inline"
        icon={Inbox}
        title="No processed emails yet"
        description="Run a sync from Overview to start categorizing your inbox."
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-1">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage ?? ""}
      </p>
      {!isPreview ? (
        <div className="space-y-3 border-b border-border-subtle bg-surface-2 px-3 py-3 sm:px-4">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <FilterTabs
            options={filterOptions}
            value={categoryFilter}
            onChange={(v) => void handleCategoryChange(v)}
          />
        </div>
      ) : null}

      {fetchError ? (
        <AlertBanner variant="error" layout="inline">
          {fetchError}
        </AlertBanner>
      ) : null}

      {loadingCategory ? (
        <LoadingSkeleton variant="table" rows={5} className="border-0" />
      ) : displayRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {searchQuery.trim()
            ? "No emails match your search."
            : "No emails in this category."}
        </p>
      ) : (
        <>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 lg:hidden">
            {displayRows.map((row) => (
              <ActivityMobileRow
                key={row.id}
                row={row}
                undoState={undoState[row.id] ?? "idle"}
                teachState={teachState[row.id] ?? "idle"}
                showTeach={!isPreview}
                onUndo={handleUndo}
                onTeach={handleTeach}
              />
            ))}
          </div>

          <div className="hidden min-w-0 max-w-full overflow-x-auto lg:block">
            {isPreview ? (
              <table
                className="w-full text-sm"
                aria-labelledby={labelledById}
              >
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Received</th>
                    <th scope="col">Message</th>
                    <th scope="col">Category</th>
                    <th scope="col">Undo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {displayRows.map((row) => (
                    <ActivityPreviewDesktopRow
                      key={row.id}
                      row={row}
                      undoState={undoState[row.id] ?? "idle"}
                      onUndo={handleUndo}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Processed email activity</caption>
                <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th
                      scope="col"
                      className="w-[11%] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4"
                    >
                      Received
                    </th>
                    <th
                      scope="col"
                      className="w-[5%] px-2 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                    >
                      <span className="sr-only">Account</span>
                    </th>
                    <th
                      scope="col"
                      className="w-[36%] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4"
                    >
                      Message
                    </th>
                    <th
                      scope="col"
                      className="w-[14%] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="w-[20%] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4"
                    >
                      Actions
                    </th>
                    <th
                      scope="col"
                      className="w-[14%] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4"
                    >
                      Teach / Undo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {displayRows.map((row) => (
                    <ActivityDesktopRow
                      key={row.id}
                      row={row}
                      undoState={undoState[row.id] ?? "idle"}
                      teachState={teachState[row.id] ?? "idle"}
                      onUndo={handleUndo}
                      onTeach={handleTeach}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!isPreview && paginate && (hasMore || rows.length > 0) && !loadingCategory ? (
        <div className="flex flex-col items-center gap-2 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
          </p>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:bg-zinc-800",
                focusRing
              )}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActivityMobileRow({
  row,
  undoState,
  teachState,
  showTeach,
  onUndo,
  onTeach,
}: {
  row: ProcessedEmailRow;
  undoState: UndoButtonState;
  teachState: TeachButtonState;
  showTeach: boolean;
  onUndo: (row: ProcessedEmailRow) => void;
  onTeach: (
    row: ProcessedEmailRow,
    actionPolicy: "archive" | "never_archive"
  ) => void;
}) {
  const undone = isUndone(row.actions_taken);
  const acctEmail = row.accounts?.email ?? "";
  const { displayName, address } = parseSender(row.sender);
  const receivedAt = formatMailpilotDateUtc(
    row.message_received_at ?? row.processed_at
  );
  const actionsText = (row.actions_taken ?? "").trim();

  return (
    <article
      className={`px-3 py-3 sm:px-4 ${undone ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${accountAvatarClass(acctEmail)}`}
          title={acctEmail || undefined}
        >
          {accountInitial(acctEmail)}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-start gap-2">
            <p
              className="min-w-0 flex-1 truncate font-semibold text-zinc-900 dark:text-zinc-50"
              title={row.sender ?? ""}
            >
              {displayName}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {showTeach ? (
                <TeachActionMenu
                  row={row}
                  state={teachState}
                  onTeach={onTeach}
                  size="compact"
                />
              ) : null}
              <UndoActionButton row={row} state={undoState} onUndo={onUndo} />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CategoryPill category={row.category} />
          </div>
          {row.subject ? (
            <p
              className="mt-1 line-clamp-2 break-words text-sm text-zinc-800 dark:text-zinc-100"
              title={row.subject}
            >
              {row.subject}
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-400 italic dark:text-zinc-500">
              (no subject)
            </p>
          )}
          {row.classification_note ? (
            <p className="mt-1 line-clamp-2 text-xs text-indigo-700/90 dark:text-indigo-300/90">
              {row.classification_note}
            </p>
          ) : null}
          {address && address !== displayName ? (
            <p
              className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
              title={address}
            >
              {address}
            </p>
          ) : null}
          <div className="mt-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <time
              dateTime={row.message_received_at ?? row.processed_at}
              title={
                row.message_received_at
                  ? `Processed ${formatMailpilotDateUtc(row.processed_at)}`
                  : undefined
              }
            >
              {receivedAt}
            </time>
            {actionsText ? (
              <p className="line-clamp-2 break-words" title={actionsText}>
                {actionsText}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ActivityPreviewDesktopRow({
  row,
  undoState,
  onUndo,
}: {
  row: ProcessedEmailRow;
  undoState: UndoButtonState;
  onUndo: (row: ProcessedEmailRow) => void;
}) {
  const undone = isUndone(row.actions_taken);
  const { displayName } = parseSender(row.sender);

  return (
    <tr
      className={`transition-colors ${
        undone ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <td
        className="px-4 py-3 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400"
        title={
          row.message_received_at
            ? `Processed ${formatMailpilotDateUtc(row.processed_at)}`
            : undefined
        }
      >
        {formatMailpilotDateUtc(row.message_received_at ?? row.processed_at)}
      </td>
      <td className="min-w-0 px-4 py-3">
        <div className="min-w-0">
          <p
            className="truncate font-medium text-zinc-900 dark:text-zinc-50"
            title={row.subject ?? ""}
          >
            {row.subject ? truncateText(row.subject, 72) : "(no subject)"}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
            title={row.sender ?? ""}
          >
            {truncateText(displayName, 48)}
          </p>
          {row.classification_note ? (
            <p className="mt-1 line-clamp-2 text-xs text-indigo-700/90 dark:text-indigo-300/90">
              {row.classification_note}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <CategoryPill category={row.category} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <UndoActionButton row={row} state={undoState} onUndo={onUndo} />
      </td>
    </tr>
  );
}

function ActivityActionChips({ actions }: { actions: string | null }) {
  const chips = parseActionChips(actions);
  if (chips.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
          >
            {chip}
          </span>
        ))}
      </div>
    );
  }

  const fallback = (actions ?? "").replace(/\s*\[UNDONE\]\s*/gi, "").trim();
  if (!fallback) return null;

  return (
    <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400" title={fallback}>
      {truncateText(fallback, 48)}
    </span>
  );
}

function ActivityDesktopRow({
  row,
  undoState,
  teachState,
  onUndo,
  onTeach,
}: {
  row: ProcessedEmailRow;
  undoState: UndoButtonState;
  teachState: TeachButtonState;
  onUndo: (row: ProcessedEmailRow) => void;
  onTeach: (
    row: ProcessedEmailRow,
    actionPolicy: "archive" | "never_archive"
  ) => void;
}) {
  const undone = isUndone(row.actions_taken);
  const acctEmail = row.accounts?.email ?? "";
  const { displayName, address } = parseSender(row.sender);
  const senderLine =
    address && address !== displayName ? address : displayName;

  return (
    <tr
      className={`transition-colors ${
        undone ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <td
        className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400 sm:px-4"
        title={
          row.message_received_at
            ? `Processed ${formatMailpilotDateUtc(row.processed_at)}`
            : undefined
        }
      >
        {formatMailpilotDateUtc(row.message_received_at ?? row.processed_at)}
      </td>
      <td className="px-2 py-2.5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${accountAvatarClass(acctEmail)}`}
          title={acctEmail || undefined}
        >
          {accountInitial(acctEmail)}
        </div>
      </td>
      <td className="min-w-0 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p
            className="truncate font-medium text-zinc-900 dark:text-zinc-50"
            title={row.subject ?? ""}
          >
            {row.subject ? truncateText(row.subject, 80) : "(no subject)"}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
            title={row.sender ?? ""}
          >
            {truncateText(senderLine, 56)}
          </p>
          {row.classification_note ? (
            <p className="mt-1 line-clamp-2 text-xs text-indigo-700/90 dark:text-indigo-300/90">
              {row.classification_note}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
        <CategoryPill category={row.category} />
      </td>
      <td className="min-w-0 px-3 py-2.5 sm:px-4">
        <ActivityActionChips actions={row.actions_taken} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
        <div className="flex items-center gap-1">
          <TeachActionMenu
            row={row}
            state={teachState}
            onTeach={onTeach}
            size="compact"
          />
          <UndoActionButton
            row={row}
            state={undoState}
            onUndo={onUndo}
            size="compact"
          />
        </div>
      </td>
    </tr>
  );
}
