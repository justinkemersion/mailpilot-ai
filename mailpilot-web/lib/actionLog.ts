import { safetyTierForCategory } from "@/lib/cleanup";
import type { CategoryActionPolicy } from "@/lib/categoryPolicy";
import type { CompositeMatchConditions } from "@/lib/preferenceGuard";

export interface ActionLogReasonInput {
  account_email?: string | null;
  account_purpose?: string | null;
  category_slug: string;
  matched_preference_id?: number | null;
  policy_applied: CategoryActionPolicy | string;
  safety_tier?: string;
  confidence?: number | null;
  hard_stop_checked?: boolean;
  block_reason?: string | null;
  intended_policy?: string | null;
  summary: string;
}

export function buildReasonJson(input: ActionLogReasonInput): Record<string, unknown> {
  return {
    account_email: input.account_email ?? null,
    account_purpose: input.account_purpose ?? "other",
    category_slug: input.category_slug,
    matched_preference_id: input.matched_preference_id ?? null,
    policy_applied: input.policy_applied,
    safety_tier: input.safety_tier ?? safetyTierForCategory(input.category_slug),
    confidence: input.confidence ?? null,
    hard_stop_checked: input.hard_stop_checked ?? false,
    ...(input.block_reason ? { block_reason: input.block_reason } : {}),
    ...(input.intended_policy ? { intended_policy: input.intended_policy } : {}),
    summary: input.summary,
  };
}

export function teachSummary(
  actionPolicy: CategoryActionPolicy,
  accountEmail: string | null,
  conditions: CompositeMatchConditions,
  scan?: {
    backfill_count?: number;
    truncated?: boolean;
    scanned_count?: number;
    scan_limit?: number;
  }
): string {
  const mailbox = accountEmail ? ` in ${accountEmail}` : "";
  let base: string;
  if (actionPolicy === "never_archive") {
    base = `Taught MailPilot to never auto-archive similar mail${mailbox}.`;
  } else {
    base = `Taught MailPilot to archive similar mail when approved${mailbox}.`;
  }
  if (scan?.backfill_count != null && scan.backfill_count > 0) {
    base += ` Marked ${scan.backfill_count} message${scan.backfill_count === 1 ? "" : "s"} in MailPilot.`;
  }
  if (scan?.truncated && scan.scanned_count != null && scan.scan_limit != null) {
    base += ` Scanned the first ${scan.scanned_count} candidates (limit ${scan.scan_limit}); older matches may remain.`;
  }
  return base;
}

export function teachRevertSummary(
  accountEmail: string | null,
  restoredCount: number
): string {
  const mailbox = accountEmail ? ` for ${accountEmail}` : "";
  return `Reverted teach rule${mailbox} and restored ${restoredCount} message${restoredCount === 1 ? "" : "s"}.`;
}
