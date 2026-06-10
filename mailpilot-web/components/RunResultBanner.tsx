"use client";

import type { RunJobRow } from "@/app/api/run/route";
import { focusRing } from "@/lib/ui";
import {
  buildStatChips,
  buildSuccessSummary,
  buildTechnicalBreakdown,
  classifyRunOutcome,
  getAccountsNeedingReauth,
  humanizeRunError,
} from "@/lib/runResultPresentation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { X } from "lucide-react";

interface RunResultBannerProps {
  job: RunJobRow;
  disconnectedEmails?: string[];
  onDismiss: () => void;
}

function StatChips({
  chips,
  tone,
}: {
  chips: ReturnType<typeof buildStatChips>;
  tone: "success" | "warning";
}) {
  if (chips.length === 0) return null;

  const chipClass =
    tone === "warning"
      ? "border-amber-200/80 bg-white/60 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
      : "border-green-200/80 bg-white/60 text-green-800 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-200";

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            chipClass
          )}
        >
          <span className="opacity-80">{chip.label}</span>
          <span className="tabular-nums">{chip.value.toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}

export function RunResultBanner({
  job,
  disconnectedEmails = [],
  onDismiss,
}: RunResultBannerProps) {
  if (job.status === "done" && job.result) {
    const r = job.result;
    const isDry = r.dry_run === true;
    const outcome = classifyRunOutcome(r);
    const reauthEmails = getAccountsNeedingReauth(r);
    const isReauthRequired = outcome === "reauth_required";
    const tone = isReauthRequired || outcome === "reauth_partial" ? "warning" : "success";
    const summary = buildSuccessSummary(r, isDry);
    const chips = buildStatChips(r);
    const breakdown = buildTechnicalBreakdown(r);

    const panelClass =
      tone === "warning"
        ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/80"
        : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/80";

    const titleClass =
      tone === "warning"
        ? "text-amber-900 dark:text-amber-200"
        : "text-green-800 dark:text-green-300";

    const bodyClass =
      tone === "warning"
        ? "text-amber-800 dark:text-amber-300"
        : "text-green-700 dark:text-green-400";

    const dismissClass =
      tone === "warning"
        ? "text-amber-700/70 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300/80 dark:hover:bg-amber-900/60 dark:hover:text-amber-100"
        : "text-green-700/70 hover:bg-green-100 hover:text-green-900 dark:text-green-300/80 dark:hover:bg-green-900/60 dark:hover:text-green-100";

    const title = isReauthRequired
      ? "Gmail reconnect required"
      : outcome === "reauth_partial"
        ? "Run complete with warnings"
        : isDry
          ? "Preview complete"
          : "Run complete";

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
        <div
          className={cn("relative rounded-lg border px-3 py-3 pr-10", panelClass)}
          role={tone === "warning" ? "alert" : "status"}
        >
          <button
            type="button"
            onClick={onDismiss}
            className={cn("absolute top-2 right-2 rounded-md p-1", dismissClass, focusRing)}
            aria-label="Dismiss run result"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <p className={cn("text-sm font-medium", titleClass)}>
            {title}
            {isDry && tone === "success" ? (
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium dark:bg-green-900">
                Dry run
              </span>
            ) : null}
          </p>
          <p className={cn("mt-1 text-sm", bodyClass)}>{summary}</p>
          {disconnectedEmails.length > 0 ? (
            <p className={cn("mt-2 text-sm", bodyClass)}>
              Removed expired{" "}
              {disconnectedEmails.length === 1 ? "connection" : "connections"} for{" "}
              {disconnectedEmails.join(", ")}. Other accounts stay connected.
            </p>
          ) : null}
          {reauthEmails.length > 0 ? (
            <Link
              href="/dashboard/accounts"
              className={cn(
                "mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2",
                bodyClass,
                focusRing
              )}
            >
              Reconnect Gmail in Accounts
            </Link>
          ) : null}
          <StatChips chips={chips} tone={tone} />
          <details className="mt-2">
            <summary
              className={cn(
                "cursor-pointer text-xs font-medium hover:opacity-90",
                bodyClass,
                focusRing
              )}
            >
              View run details
            </summary>
            <ul className={cn("mt-2 space-y-0.5 text-xs", bodyClass)}>
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
