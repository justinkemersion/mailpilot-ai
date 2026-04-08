"use client";

import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export interface ProcessedEmailRow {
  id: number;
  gmail_message_id: string;
  account_id: number;
  accounts: { email: string } | null;
  category: string;
  subject: string | null;
  sender: string | null;
  processed_at: string;
  message_received_at: string | null;
  actions_taken: string | null;
  was_archived: boolean;
  applied_label_names: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  important: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  work: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  personal: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  newsletters: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  promotions: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  receipts: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400",
  spam: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const CATEGORY_ORDER = [
  "important",
  "work",
  "personal",
  "newsletters",
  "promotions",
  "receipts",
  "spam",
];

const AVATAR_PALETTE = [
  "bg-violet-600 text-white",
  "bg-sky-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-cyan-600 text-white",
  "bg-fuchsia-600 text-white",
  "bg-lime-700 text-white",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function accountInitial(email: string | undefined | null): string {
  if (!email) return "?";
  const local = email.split("@")[0]?.trim() || email;
  const ch = local[0];
  return ch ? ch.toUpperCase() : "?";
}

function accountAvatarClass(email: string | undefined | null): string {
  if (!email) return "bg-zinc-500 text-white";
  const idx = hashString(email.toLowerCase()) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx] ?? AVATAR_PALETTE[0];
}

/** Parse From-style strings: "Name" <a@b>, Name <a@b>, a@b */
function parseSender(raw: string | null): {
  displayName: string;
  address: string | null;
} {
  if (!raw?.trim()) {
    return { displayName: "Unknown", address: null };
  }
  const s = raw.trim();
  const angle = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    let name = angle[1].trim();
    const addr = angle[2].trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1);
    }
    const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
    if (!name && emailLike) {
      return { displayName: addr.split("@")[0] || addr, address: addr };
    }
    return {
      displayName: name || addr.split("@")[0] || addr,
      address: emailLike ? addr : null,
    };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { displayName: s.split("@")[0] || s, address: s };
  }
  return { displayName: s, address: null };
}

function truncate(s: string | null | undefined, max = 48): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function isUndone(actions: string | null): boolean {
  return (actions ?? "").includes("[UNDONE]");
}

function canUndo(row: ProcessedEmailRow): boolean {
  if (isUndone(row.actions_taken)) return false;
  const hasLabels =
    row.applied_label_names !== null && row.applied_label_names !== "[]";
  return hasLabels || row.was_archived;
}

function sortCategoriesUnique(cats: string[]): string[] {
  const seen = new Set<string>();
  const fromOrder: string[] = [];
  for (const c of CATEGORY_ORDER) {
    if (cats.includes(c) && !seen.has(c)) {
      seen.add(c);
      fromOrder.push(c);
    }
  }
  const rest = cats.filter((c) => !seen.has(c)).sort((a, b) => a.localeCompare(b));
  return [...fromOrder, ...rest];
}

interface UndoState {
  [id: number]: "idle" | "pending" | "done" | "error";
}

export function HistoryTable({ rows: initialRows }: { rows: ProcessedEmailRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ProcessedEmailRow[]>(initialRows);
  const [undoState, setUndoState] = useState<UndoState>({});
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const rowsSyncKey = useMemo(
    () =>
      initialRows.map((r) => `${r.id}:${r.actions_taken ?? ""}`).join("|"),
    [initialRows]
  );

  useEffect(() => {
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server-sent row content changes
  }, [rowsSyncKey]);

  const categoriesInData = useMemo(() => {
    const u = [...new Set(rows.map((r) => r.category).filter(Boolean))];
    return sortCategoriesUnique(u);
  }, [rows]);

  const displayRows = useMemo(() => {
    if (categoryFilter === null) return rows;
    return rows.filter((r) => r.category === categoryFilter);
  }, [rows, categoryFilter]);

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
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900 sm:px-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No processed emails yet.
        </p>
        <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
          Run the MailPilot worker to start categorizing your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
        <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Filter by category
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === null
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            All
          </button>
          {categoriesInData.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                categoryFilter === cat
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Received
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Account
              </th>
              <th className="min-w-[8rem] px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Sender
              </th>
              <th className="min-w-[10rem] px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Subject
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Category
              </th>
              <th className="min-w-[8rem] px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Actions
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:px-4">
                Undo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {displayRows.map((row) => {
              const state = undoState[row.id] ?? "idle";
              const undone = isUndone(row.actions_taken);
              const undoable = canUndo(row);
              const categoryColor =
                CATEGORY_COLORS[row.category] ??
                "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
              const acctEmail = row.accounts?.email ?? "";
              const { displayName, address } = parseSender(row.sender);

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    undone ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <td
                    className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 sm:px-4"
                    title={
                      row.message_received_at
                        ? `Processed ${formatMailpilotDateUtc(row.processed_at)}`
                        : undefined
                    }
                  >
                    {formatMailpilotDateUtc(
                      row.message_received_at ?? row.processed_at
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
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
                        {truncate(displayName, 40)}
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
                      {truncate(row.subject, 56)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryColor}`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="max-w-[200px] px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 sm:px-4">
                    <span className="line-clamp-2" title={row.actions_taken ?? ""}>
                      {truncate(row.actions_taken, 52)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                    {undoable && !undone && (
                      <button
                        type="button"
                        onClick={() => void handleUndo(row)}
                        disabled={state === "pending"}
                        aria-label="Undo Gmail changes for this message"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {state === "pending" ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Undo2 className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    )}
                    {state === "error" && (
                      <span className="text-xs text-red-500">Failed</span>
                    )}
                    {undone && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        Undone
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {categoryFilter !== null && displayRows.length === 0 && (
        <p className="border-t border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          No emails in this category.
        </p>
      )}
    </div>
  );
}
