"use client";

import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { useState } from "react";

export interface ProcessedEmailRow {
  id: number;
  gmail_message_id: string;
  account_id: number;
  accounts: { email: string } | null;
  category: string;
  subject: string | null;
  sender: string | null;
  processed_at: string;
  /** Gmail internalDate (when the message arrived); may be null on older rows. */
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

function truncate(s: string | null | undefined, max = 48): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function isUndone(actions: string | null): boolean {
  return (actions ?? "").includes("[UNDONE]");
}

function canUndo(row: ProcessedEmailRow): boolean {
  if (isUndone(row.actions_taken)) return false;
  // Only undo rows where we actually applied something
  const hasLabels =
    row.applied_label_names !== null && row.applied_label_names !== "[]";
  return hasLabels || row.was_archived;
}

interface UndoState {
  [id: number]: "idle" | "pending" | "done" | "error";
}

export function HistoryTable({ rows: initialRows }: { rows: ProcessedEmailRow[] }) {
  const [rows, setRows] = useState<ProcessedEmailRow[]>(initialRows);
  const [undoState, setUndoState] = useState<UndoState>({});

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
    } catch (err) {
      console.error("Undo failed:", err);
      setUndoState((s) => ({ ...s, [row.id]: "error" }));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
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
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Received
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Account
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Sender
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Actions taken
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Undo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => {
              const state = undoState[row.id] ?? "idle";
              const undone = isUndone(row.actions_taken);
              const undoable = canUndo(row);
              const categoryColor =
                CATEGORY_COLORS[row.category] ??
                "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    undone ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <td
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs"
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
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap text-xs">
                    {truncate(row.accounts?.email ?? "", 28)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200 max-w-[180px]">
                    <span title={row.sender ?? ""}>
                      {truncate(row.sender, 36)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100 max-w-[220px]">
                    <span title={row.subject ?? ""}>
                      {truncate(row.subject, 48)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor}`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 max-w-[200px] text-xs">
                    <span title={row.actions_taken ?? ""}>
                      {truncate(row.actions_taken, 52)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {undoable && !undone && (
                      <button
                        onClick={() => handleUndo(row)}
                        disabled={state === "pending"}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {state === "pending" ? "Undoing…" : "Undo"}
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
    </div>
  );
}
