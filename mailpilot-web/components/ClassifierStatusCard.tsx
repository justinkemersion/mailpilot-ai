import { StatusBadge } from "@/components/ui/StatusBadge";
import type { RunJobRow } from "@/app/api/run/route";
import {
  classifierLabel,
  classifierProviderName,
} from "@/lib/formatClassifier";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { Cpu } from "lucide-react";

interface ClassifierStatusCardProps {
  job: RunJobRow | null;
}

function runStatusBadge(
  status: RunJobRow["status"] | undefined
): "pending" | "running" | "done" | "failed" | null {
  if (status === "pending" || status === "running" || status === "done" || status === "failed") {
    return status;
  }
  return null;
}

export function ClassifierStatusCard({ job }: ClassifierStatusCardProps) {
  const result = job?.status === "done" ? job.result : null;
  const label = classifierLabel(result ?? job?.result);
  const provider = classifierProviderName(result ?? job?.result);
  const model = result?.ai_model ?? job?.result?.ai_model;
  const lastRunAt = job?.completed_at ?? job?.started_at ?? null;
  const processed = result?.processed;
  const llmCalls = result?.llm_calls;
  const statusBadge = runStatusBadge(job?.status);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60">
          <Cpu className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              AI classifier
            </h3>
            {statusBadge && job?.status !== "done" ? (
              <StatusBadge status={statusBadge} />
            ) : null}
          </div>
          {label ? (
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{label}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Run a sync to see which model processed your mail.
            </p>
          )}
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {provider ? (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Provider</dt>
                <dd className="font-medium text-zinc-800 dark:text-zinc-200">{provider}</dd>
              </div>
            ) : null}
            {model ? (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Model</dt>
                <dd className="truncate font-medium text-zinc-800 dark:text-zinc-200" title={model}>
                  {model}
                </dd>
              </div>
            ) : null}
            {lastRunAt ? (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Last run</dt>
                <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatMailpilotDateUtc(lastRunAt)}
                </dd>
              </div>
            ) : null}
            {processed != null ? (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Last run processed</dt>
                <dd className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  {processed.toLocaleString()}
                </dd>
              </div>
            ) : null}
            {llmCalls != null ? (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">LLM calls (last run)</dt>
                <dd className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  {llmCalls.toLocaleString()}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}
