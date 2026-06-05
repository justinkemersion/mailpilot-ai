"use client";

import { FilterTabs, type FilterTabOption } from "@/components/ui/FilterTabs";
import { CategoryPill } from "@/components/ui/CategoryPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  UndoActionButton,
  type UndoButtonState,
} from "@/components/UndoActionButton";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import { CATEGORY_ORDER } from "@/lib/categories";
import {
  EMAIL_ACTIVITY_PAGE_SIZE,
  isUndone,
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
      setUndoState((s) => ({ ...s, [row.id]: "done" }));
      setStatusMessage(`Gmail changes undone for “${row.subject ?? "message"}”.`);
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
        icon={Inbox}
        title="No processed emails yet"
        description="Run the MailPilot worker to start categorizing your inbox."
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage ?? ""}
      </p>
      {!isPreview ? (
        <div className="space-y-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <FilterTabs
            options={filterOptions}
            value={categoryFilter}
            onChange={(v) => void handleCategoryChange(v)}
          />
        </div>
      ) : null}

      {fetchError ? (
        <p
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          role="alert"
        >
          {fetchError}
        </p>
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
                onUndo={handleUndo}
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
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Processed email activity</caption>
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Received
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Account
                    </th>
                    <th
                      scope="col"
                      className="min-w-[8rem] px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Sender
                    </th>
                    <th
                      scope="col"
                      className="min-w-[10rem] px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Subject
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="min-w-[8rem] px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Actions
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400 sm:px-4"
                    >
                      Undo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {displayRows.map((row) => (
                    <ActivityDesktopRow
                      key={row.id}
                      row={row}
                      undoState={undoState[row.id] ?? "idle"}
                      onUndo={handleUndo}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!isPreview && paginate && hasMore && !loadingCategory ? (
        <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className={cn(
              "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:bg-zinc-800",
              focusRing
            )}
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              `Load more (${rows.length.toLocaleString()} of ${total.toLocaleString()})`
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityMobileRow({
  row,
  undoState,
  onUndo,
}: {
  row: ProcessedEmailRow;
  undoState: UndoButtonState;
  onUndo: (row: ProcessedEmailRow) => void;
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
            <UndoActionButton row={row} state={undoState} onUndo={onUndo} />
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

function ActivityDesktopRow({
  row,
  undoState,
  onUndo,
}: {
  row: ProcessedEmailRow;
  undoState: UndoButtonState;
  onUndo: (row: ProcessedEmailRow) => void;
}) {
  const undone = isUndone(row.actions_taken);
  const acctEmail = row.accounts?.email ?? "";
  const { displayName, address } = parseSender(row.sender);

  return (
    <tr
      className={`transition-colors ${
        undone ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <td
        className="px-3 py-3 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400 sm:px-4"
        title={
          row.message_received_at
            ? `Processed ${formatMailpilotDateUtc(row.processed_at)}`
            : undefined
        }
      >
        {formatMailpilotDateUtc(row.message_received_at ?? row.processed_at)}
      </td>
      <td className="px-3 py-3 whitespace-nowrap sm:px-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${accountAvatarClass(acctEmail)}`}
          title={acctEmail || undefined}
        >
          {accountInitial(acctEmail)}
        </div>
      </td>
      <td className="max-w-[200px] px-3 py-3 sm:max-w-[220px] sm:px-4">
        <div className="min-w-0">
          <p
            className="truncate font-semibold text-zinc-900 dark:text-zinc-50"
            title={row.sender ?? ""}
          >
            {truncateText(displayName, 40)}
          </p>
          {address && address !== displayName ? (
            <p
              className="truncate text-xs text-zinc-500 dark:text-zinc-400"
              title={address}
            >
              {address}
            </p>
          ) : null}
        </div>
      </td>
      <td className="max-w-[220px] px-3 py-3 text-zinc-800 dark:text-zinc-100 sm:px-4">
        <span className="line-clamp-2" title={row.subject ?? ""}>
          {truncateText(row.subject, 56)}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap sm:px-4">
        <CategoryPill category={row.category} />
      </td>
      <td className="max-w-[200px] px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 sm:px-4">
        <span className="line-clamp-2" title={row.actions_taken ?? ""}>
          {truncateText(row.actions_taken, 52)}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap sm:px-4">
        <UndoActionButton row={row} state={undoState} onUndo={onUndo} />
      </td>
    </tr>
  );
}
