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
  conditions: CompositeMatchConditions
): string {
  const mailbox = accountEmail ? ` in ${accountEmail}` : "";
  if (actionPolicy === "never_archive") {
    return `Taught MailPilot to never auto-archive similar mail${mailbox}.`;
  }
  return `Taught MailPilot to archive similar mail when approved${mailbox}.`;
}
