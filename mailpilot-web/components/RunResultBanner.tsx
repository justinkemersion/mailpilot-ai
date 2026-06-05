"use client";

import type { RunJobRow } from "@/app/api/run/route";
import { classifierLabel } from "@/lib/formatClassifier";
import { X } from "lucide-react";

interface RunResultBannerProps {
  job: RunJobRow;
  onDismiss: () => void;
}

export function RunResultBanner({ job, onDismiss }: RunResultBannerProps) {
  if (job.status === "done" && job.result) {
    const r = job.result;
    const isDry = r.dry_run;
    const prefix = isDry ? "Would have: " : "";

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
        <div className="relative rounded-lg border border-green-200 bg-green-50 px-3 py-2 pr-10 dark:border-green-800 dark:bg-green-950/80">
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-2 right-2 rounded-md p-1 text-green-700/70 hover:bg-green-100 hover:text-green-900 dark:text-green-300/80 dark:hover:bg-green-900/60 dark:hover:text-green-100"
            aria-label="Dismiss run result"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <p className="text-xs font-medium text-green-800 dark:text-green-300">
            Run complete
            {isDry ? (
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] dark:bg-green-900">
                dry run
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
            {r.accounts_processed ?? 0} account(s) · {r.candidates ?? 0} messages ·{" "}
            {r.processed ?? 0} processed. {prefix}Labels: {r.labels_applied ?? 0}, archived:{" "}
            {r.archived ?? 0}, spam: {r.spam_marked ?? 0}.
          </p>
          <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
            LLM calls: {r.llm_calls ?? 0}, rule-based: {r.prefiltered ?? 0}, skipped by budget:{" "}
            {r.skipped_by_budget ?? 0}
            {(r.skipped_by_ai_limit ?? 0) > 0
              ? `, skipped by AI limit: ${r.skipped_by_ai_limit}`
              : ""}
            .
          </p>
          {classifierLabel(r) ? (
            <p className="mt-1 text-xs font-medium text-green-800 dark:text-green-300">
              AI classifier: {classifierLabel(r)}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="relative rounded-lg border border-red-200 bg-red-50 px-3 py-2 pr-10 dark:border-red-800 dark:bg-red-950/80">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-2 right-2 rounded-md p-1 text-red-600/70 hover:bg-red-100 hover:text-red-800 dark:text-red-400/80 dark:hover:bg-red-900/60"
          aria-label="Dismiss error"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
        <p className="text-xs font-medium text-red-700 dark:text-red-400">Run failed</p>
        {job.error ? (
          <p className="mt-0.5 break-all font-mono text-[10px] text-red-600 dark:text-red-500">
            {job.error}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
