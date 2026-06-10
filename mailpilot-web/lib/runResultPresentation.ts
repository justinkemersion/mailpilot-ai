import type { RunJobRow } from "@/app/api/run/route";
import { classifierLabel } from "@/lib/formatClassifier";

type RunResult = NonNullable<RunJobRow["result"]>;

export interface StatChip {
  label: string;
  value: number;
}

export type RunOutcomeKind = "success" | "reauth_required" | "reauth_partial";

const REAUTH_HINT =
  "Reconnect each address on the Accounts page. Google OAuth apps in Testing mode usually need re-consent about once a week.";

export function getAccountsNeedingReauth(result: RunResult): string[] {
  const raw = result.accounts_needing_reauth;
  if (!Array.isArray(raw)) return [];
  return raw.filter((email): email is string => typeof email === "string" && email.length > 0);
}

export function classifyRunOutcome(result: RunResult): RunOutcomeKind {
  const reauth = getAccountsNeedingReauth(result);
  if (reauth.length === 0) return "success";

  const processed = result.processed ?? 0;
  const accounts = result.accounts_processed ?? 0;
  if (processed === 0 && accounts > 0 && reauth.length >= accounts) {
    return "reauth_required";
  }
  return "reauth_partial";
}

export function buildReauthSummary(reauthEmails: string[]): string {
  if (reauthEmails.length === 1) {
    return `Gmail sign-in expired or was revoked for ${reauthEmails[0]}. ${REAUTH_HINT}`;
  }
  return `Gmail sign-in expired or was revoked for ${reauthEmails.length} accounts (${reauthEmails.join(", ")}). ${REAUTH_HINT}`;
}

export function buildSuccessSummary(result: RunResult, dryRun: boolean): string {
  const reauth = getAccountsNeedingReauth(result);
  const outcome = classifyRunOutcome(result);

  if (outcome === "reauth_required") {
    return buildReauthSummary(reauth);
  }

  const accounts = result.accounts_processed ?? 0;
  const processed = result.processed ?? 0;
  const accountWord = accounts === 1 ? "account" : "accounts";
  const messageWord = processed === 1 ? "message" : "messages";

  if (dryRun) {
    const base = `Preview complete — would have scanned ${accounts.toLocaleString()} ${accountWord} and processed ${processed.toLocaleString()} ${messageWord}.`;
    if (outcome === "reauth_partial") {
      return `${base} Some accounts could not be accessed and need Gmail reconnect.`;
    }
    return base;
  }

  const base = `Run complete — ${accounts.toLocaleString()} ${accountWord} scanned, ${processed.toLocaleString()} ${messageWord} processed.`;
  if (outcome === "reauth_partial") {
    return `${base} Some accounts could not be accessed and need Gmail reconnect.`;
  }
  return base;
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
  const reauth = getAccountsNeedingReauth(result);

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
  if (reauth.length > 0) {
    lines.push(`Needs Gmail reconnect: ${reauth.join(", ")}`);
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
