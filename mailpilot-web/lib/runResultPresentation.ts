import type { RunJobRow } from "@/app/api/run/route";
import { classifierLabel } from "@/lib/formatClassifier";

type RunResult = NonNullable<RunJobRow["result"]>;

export interface StatChip {
  label: string;
  value: number;
}

export function buildSuccessSummary(result: RunResult, dryRun: boolean): string {
  const accounts = result.accounts_processed ?? 0;
  const processed = result.processed ?? 0;
  const accountWord = accounts === 1 ? "account" : "accounts";
  const messageWord = processed === 1 ? "message" : "messages";

  if (dryRun) {
    return `Preview complete — would have scanned ${accounts.toLocaleString()} ${accountWord} and processed ${processed.toLocaleString()} ${messageWord}.`;
  }

  return `Run complete — ${accounts.toLocaleString()} ${accountWord} scanned, ${processed.toLocaleString()} ${messageWord} processed.`;
}

export function buildStatChips(result: RunResult): StatChip[] {
  const chips: StatChip[] = [];
  const processed = result.processed ?? 0;
  const labeled = result.labels_applied ?? 0;
  const archived = result.archived ?? 0;
  const spam = result.spam_marked ?? 0;

  if (processed > 0) chips.push({ label: "Processed", value: processed });
  if (labeled > 0) chips.push({ label: "Labeled", value: labeled });
  if (archived > 0) chips.push({ label: "Archived", value: archived });
  if (spam > 0) chips.push({ label: "Spam", value: spam });

  return chips.slice(0, 4);
}

export function buildTechnicalBreakdown(result: RunResult): string[] {
  const lines: string[] = [];
  const accounts = result.accounts_processed ?? 0;
  const candidates = result.candidates ?? 0;
  const processed = result.processed ?? 0;
  const labeled = result.labels_applied ?? 0;
  const archived = result.archived ?? 0;
  const spam = result.spam_marked ?? 0;
  const llmCalls = result.llm_calls ?? 0;
  const prefiltered = result.prefiltered ?? 0;
  const skippedBudget = result.skipped_by_budget ?? 0;
  const skippedAiLimit = result.skipped_by_ai_limit ?? 0;
  const skippedClaim = result.skipped_by_claim_conflict ?? 0;

  lines.push(`Accounts scanned: ${accounts.toLocaleString()}`);
  lines.push(`Messages found: ${candidates.toLocaleString()}`);
  lines.push(`Processed: ${processed.toLocaleString()}`);
  lines.push(`Labeled: ${labeled.toLocaleString()}`);
  lines.push(`Archived: ${archived.toLocaleString()}`);
  lines.push(`Spam marked: ${spam.toLocaleString()}`);
  lines.push(`LLM calls: ${llmCalls.toLocaleString()}`);
  lines.push(`Rule-based (prefiltered): ${prefiltered.toLocaleString()}`);
  lines.push(`Skipped by budget: ${skippedBudget.toLocaleString()}`);
  if (skippedAiLimit > 0) {
    lines.push(`Skipped by AI limit: ${skippedAiLimit.toLocaleString()}`);
  }
  if (skippedClaim > 0) {
    lines.push(`Skipped by claim conflict: ${skippedClaim.toLocaleString()}`);
  }

  const label = classifierLabel(result);
  if (label) {
    lines.push(`AI classifier: ${label}`);
  }

  return lines;
}

export function humanizeRunError(error: string | null | undefined): string {
  if (!error?.trim()) {
    return "Sync couldn't finish. Try again in a few minutes.";
  }

  const normalized = error.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "Sync timed out before it could finish.";
  }
  if (
    normalized.includes("auth") ||
    normalized.includes("token") ||
    normalized.includes("credential")
  ) {
    return "Gmail authentication may have expired. Reconnect your account and try again.";
  }
  if (normalized.includes("runner") || normalized.includes("watch-jobs")) {
    return "MailPilot couldn't reach the background worker. Try again shortly.";
  }
  if (normalized.includes("http") || normalized.includes("500") || normalized.includes("503")) {
    return "Sync encountered a server error. Try again in a few minutes.";
  }

  return "Sync couldn't finish. Try again in a few minutes.";
}
