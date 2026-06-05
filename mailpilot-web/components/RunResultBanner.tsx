"use client";

import type { RunJobRow } from "@/app/api/run/route";
import { focusRing } from "@/lib/ui";
import {
  buildStatChips,
  buildSuccessSummary,
  buildTechnicalBreakdown,
  humanizeRunError,
} from "@/lib/runResultPresentation";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface RunResultBannerProps {
  job: RunJobRow;
  onDismiss: () => void;
}

function StatChips({ chips }: { chips: ReturnType<typeof buildStatChips> }) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded-full border border-green-200/80 bg-white/60 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-200"
        >
          <span className="text-green-600/80 dark:text-green-400/80">{chip.label}</span>
          <span className="tabular-nums">{chip.value.toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}

export function RunResultBanner({ job, onDismiss }: RunResultBannerProps) {
  if (job.status === "done" && job.result) {
    const r = job.result;
    const isDry = r.dry_run === true;
    const summary = buildSuccessSummary(r, isDry);
    const chips = buildStatChips(r);
    const breakdown = buildTechnicalBreakdown(r);

    return (
      <div className="relative space-y-2">
        {r.ai_limit_hit ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 pr-10 dark:border-amber-800 dark:bg-amber-950/80"
            role="alert"
          >
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              AI limit reached
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              {r.ai_limit_message ??
                "Your AI provider rate or usage limit was hit during this run."}
            </p>
          </div>
        ) : null}
        <div className="relative rounded-lg border border-green-200 bg-green-50 px-3 py-3 pr-10 dark:border-green-800 dark:bg-green-950/80">
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "absolute top-2 right-2 rounded-md p-1 text-green-700/70 hover:bg-green-100 hover:text-green-900 dark:text-green-300/80 dark:hover:bg-green-900/60 dark:hover:text-green-100",
              focusRing
            )}
            aria-label="Dismiss run result"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            {isDry ? "Preview complete" : "Run complete"}
            {isDry ? (
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase dark:bg-green-900">
                dry run
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-green-700 dark:text-green-400">{summary}</p>
          <StatChips chips={chips} />
          <details className="mt-2">
            <summary
              className={cn(
                "cursor-pointer text-xs font-medium text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200",
                focusRing
              )}
            >
              View run details
            </summary>
            <ul className="mt-2 space-y-0.5 text-xs text-green-700 dark:text-green-400">
              {breakdown.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    const friendly = humanizeRunError(job.error);

    return (
      <div className="relative rounded-lg border border-red-200 bg-red-50 px-3 py-3 pr-10 dark:border-red-800 dark:bg-red-950/80">
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "absolute top-2 right-2 rounded-md p-1 text-red-600/70 hover:bg-red-100 hover:text-red-800 dark:text-red-400/80 dark:hover:bg-red-900/60",
            focusRing
          )}
          aria-label="Dismiss error"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
        <p className="text-sm font-medium text-red-700 dark:text-red-400">Run failed</p>
        <p className="mt-1 text-sm text-red-600 dark:text-red-300">{friendly}</p>
        {job.error ? (
          <details className="mt-2">
            <summary
              className={cn(
                "cursor-pointer text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300",
                focusRing
              )}
            >
              View run details
            </summary>
            <p className="mt-2 break-all font-mono text-xs text-red-600 dark:text-red-500">
              {job.error}
            </p>
          </details>
        ) : null}
      </div>
    );
  }

  return null;
}
