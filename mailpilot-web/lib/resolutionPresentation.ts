import type { MailActionTaken } from "@/lib/actionLogTypes";

export type ResolutionStatus =
  | "unresolved"
  | "kept"
  | "archived"
  | "needs_attention"
  | "blocked";

const STATUS_LABELS: Record<ResolutionStatus, string> = {
  unresolved: "Awaiting decision",
  kept: "Kept in inbox",
  archived: "Archived",
  needs_attention: "Needs attention",
  blocked: "Archive blocked",
};

export function resolutionStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.unresolved;
  return STATUS_LABELS[status as ResolutionStatus] ?? status.replace(/_/g, " ");
}

export function blockedExplanation(reason: Record<string, unknown> | null | undefined): string {
  if (!reason) {
    return "MailPilot blocked an archive attempt for safety reasons.";
  }
  const summary = reason.summary;
  if (typeof summary === "string" && summary.trim()) return summary;
  const blockReason = reason.block_reason;
  if (typeof blockReason === "string" && blockReason.trim()) {
    return `Archive blocked (${blockReason.replace(/^hard_stop_/, "").replace(/_/g, " ")}).`;
  }
  return "MailPilot blocked an archive attempt for safety reasons.";
}

export function actionExplainLine(
  action: MailActionTaken,
  reason: Record<string, unknown> | null | undefined
): string {
  if (action === "archive_blocked") {
    return blockedExplanation(reason);
  }
  const summary = reason?.summary;
  if (typeof summary === "string" && summary.trim()) return summary;
  return "";
}

export function resolutionBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
    case "archived":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "kept":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200";
    case "needs_attention":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300";
  }
}
