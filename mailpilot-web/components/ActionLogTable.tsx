"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import {
  accountEmailFromLog,
  actionTakenLabel,
  type MailActionLogRow,
  type MailActionTaken,
} from "@/lib/actionLogTypes";
import { actionExplainLine } from "@/lib/resolutionPresentation";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuditFilter = "all" | "blocked" | "teach" | "cleanup";

const FILTER_OPTIONS: Array<{ value: AuditFilter; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "blocked", label: "Blocked" },
  { value: "teach", label: "Teach" },
  { value: "cleanup", label: "Cleanup" },
];

async function fetchActionLog(params: {
  offset: number;
  limit: number;
  filter: AuditFilter;
}): Promise<{
  rows: MailActionLogRow[];
  total: number;
  offset: number;
  limit: number;
}> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.filter === "blocked") {
    query.set("blocked", "1");
  } else if (params.filter === "teach") {
    query.set("action", "teach");
  } else if (params.filter === "cleanup") {
    query.set("action", "cleanup_archive");
  }

  const res = await fetch(`/api/action-log?${query.toString()}`);
  if (!res.ok) throw new Error(`Failed to load audit trail (${res.status})`);
  return (await res.json()) as {
    rows: MailActionLogRow[];
    total: number;
    offset: number;
    limit: number;
  };
}

function actionBadgeClass(action: MailActionTaken): string {
  if (action === "archive_blocked") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (action === "teach") {
    return "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200";
  }
  if (action === "teach_revert") {
    return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200";
  }
  if (action === "cleanup_archive" || action === "cleanup_keep") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300";
}

export function ActionLogTable() {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [rows, setRows] = useState<MailActionLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertPendingId, setRevertPendingId] = useState<number | null>(null);
  const limit = 50;

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchActionLog({ offset: nextOffset, limit, filter });
        setTotal(page.total);
        setOffset(page.offset);
        setRows((prev) => (append ? [...prev, ...page.rows] : page.rows));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load audit trail.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  const hasMore = useMemo(() => rows.length < total, [rows.length, total]);

  async function handleRevertTeach(preferenceId: number) {
    setRevertPendingId(preferenceId);
    setError(null);
    try {
      const res = await fetch(`/api/preferences/${preferenceId}/revert-teach`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: string;
        message?: string;
        demo?: boolean;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revert teach rule.");
    } finally {
      setRevertPendingId(null);
    }
  }

  if (loading) {
    return <LoadingSkeleton variant="table" rows={4} />;
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-1">
      <div className="flex flex-wrap gap-2 border-b border-border-subtle bg-surface-2 px-3 py-3 sm:px-4">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
              focusRing,
              filter === option.value
                ? "bg-accent text-white"
                : "border border-border-subtle bg-surface-1 text-text-primary hover:bg-surface-2"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <AlertBanner variant="error" layout="inline">
          {error}
        </AlertBanner>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={ClipboardList}
          title="No audit entries yet"
          description="Cleanup actions, teach events, and blocked archives will appear here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => {
            const acctEmail = accountEmailFromLog(row) ?? "";
            const explain = actionExplainLine(row.action_taken, row.reason_json);
            const subject =
              typeof row.previous_state_json?.subject === "string"
                ? row.previous_state_json.subject
                : row.gmail_message_id;
            return (
              <li key={row.id} className="px-3 py-3 sm:px-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:flex",
                      accountAvatarClass(acctEmail)
                    )}
                    title={acctEmail || undefined}
                  >
                    {accountInitial(acctEmail)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          actionBadgeClass(row.action_taken)
                        )}
                      >
                        {row.action_taken === "archive_blocked" ? (
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                        ) : null}
                        {actionTakenLabel(row.action_taken)}
                      </span>
                      <time
                        dateTime={row.created_at}
                        className="text-xs text-text-muted"
                      >
                        {formatMailpilotDateUtc(row.created_at)}
                      </time>
                    </div>
                    <p
                      className="mt-1 truncate text-sm font-medium text-text-primary"
                      title={subject}
                    >
                      {subject}
                    </p>
                    {acctEmail ? (
                      <p className="mt-0.5 text-xs text-text-muted">{acctEmail}</p>
                    ) : null}
                    {explain ? (
                      <p className="mt-2 text-sm text-text-muted">{explain}</p>
                    ) : null}
                    {row.action_taken === "teach" && row.preference_id ? (
                      <button
                        type="button"
                        onClick={() => void handleRevertTeach(row.preference_id!)}
                        disabled={revertPendingId === row.preference_id}
                        className={cn(
                          "mt-2 text-sm font-medium text-accent hover:underline disabled:opacity-50",
                          focusRing
                        )}
                      >
                        {revertPendingId === row.preference_id
                          ? "Reverting…"
                          : "Revert teach"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="border-t border-border-subtle px-4 py-4 text-center">
          <button
            type="button"
            onClick={() => void load(offset + limit, true)}
            disabled={loadingMore}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-6 text-sm font-medium text-text-primary hover:bg-surface-1 disabled:opacity-50",
              focusRing
            )}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
