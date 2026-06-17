import {
  SAFETY_TIER_LABELS,
  SYSTEM_CATEGORY_POLICIES,
  type SafetyTier,
} from "@/lib/categoryPolicy";
import type { ProcessedEmailRow } from "@/lib/emailActivity";

export type CleanupAction = "archive" | "keep";

export interface CleanupCandidate extends ProcessedEmailRow {
  safety_tier: SafetyTier;
  safety_label: string;
}

export interface CleanupGroup {
  tier: SafetyTier;
  title: string;
  description: string;
  candidates: CleanupCandidate[];
}

const CATEGORY_TIER = new Map(
  SYSTEM_CATEGORY_POLICIES.map((policy) => [policy.slug, policy.safetyTier])
);

export const CLEANUP_GROUP_ORDER: SafetyTier[] = [
  "safe_auto",
  "review",
  "never_auto",
];

export const CLEANUP_GROUP_COPY: Record<
  SafetyTier,
  { title: string; description: string }
> = {
  safe_auto: {
    title: "Safe to archive",
    description: "Low-risk labeled mail that needs your approval before it leaves the inbox.",
  },
  review: {
    title: "Review before archive",
    description: "Messages MailPilot should not clear without a human decision.",
  },
  never_auto: {
    title: "Needs attention",
    description: "Sensitive or risky mail. You can resolve it manually, but automation stays blocked.",
  },
};

export function safetyTierForCategory(category: string | null | undefined): SafetyTier {
  return CATEGORY_TIER.get(category ?? "") ?? "review";
}

export function toCleanupCandidate(row: ProcessedEmailRow): CleanupCandidate {
  const safety_tier = safetyTierForCategory(row.category);
  return {
    ...row,
    safety_tier,
    safety_label: SAFETY_TIER_LABELS[safety_tier],
  };
}

export function groupCleanupCandidates(rows: ProcessedEmailRow[]): CleanupGroup[] {
  const candidates = rows.map(toCleanupCandidate);
  return CLEANUP_GROUP_ORDER.map((tier) => ({
    tier,
    ...CLEANUP_GROUP_COPY[tier],
    candidates: candidates.filter((candidate) => candidate.safety_tier === tier),
  }));
}

export function countCleanupCandidates(groups: CleanupGroup[]): number {
  return groups.reduce((sum, group) => sum + group.candidates.length, 0);
}

export function normalizeCleanupAction(value: unknown): CleanupAction | null {
  return value === "archive" || value === "keep" ? value : null;
}
