import type { RunJobRow } from "@/app/api/run/route";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";

interface DemoSyncHistoryProps {
  runs: RunJobRow[];
}

export function DemoSyncHistory({ runs }: DemoSyncHistoryProps) {
  if (runs.length === 0) return null;

  return (
    <section aria-labelledby="demo-sync-history-heading">
      <h3
        id="demo-sync-history-heading"
        className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Recent sync runs
      </h3>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-1">
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {run.result?.processed != null
                  ? `${run.result.processed} messages classified`
                  : "Sync run"}
              </p>
              <p className="text-xs text-text-muted">
                {formatMailpilotDateUtc(run.completed_at ?? run.created_at)}
              </p>
              {run.error ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {run.error}
                </p>
              ) : null}
            </div>
            <StatusBadge status={run.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
