/** System category policy seeds (mirrors runner category_seeds.py). */

export type SafetyTier = "safe_auto" | "review" | "never_auto";

export type CategoryActionPolicy =
  | "keep_inbox"
  | "archive"
  | "ask_first"
  | "nudge"
  | "never_archive";

export interface CategoryPolicySeed {
  slug: string;
  name: string;
  labelName: string;
  defaultAction: CategoryActionPolicy;
  safetyTier: SafetyTier;
}

export const SYSTEM_CATEGORY_POLICIES: CategoryPolicySeed[] = [
  {
    slug: "important",
    name: "Important",
    labelName: "mailpilot/important",
    defaultAction: "keep_inbox",
    safetyTier: "never_auto",
  },
  {
    slug: "work",
    name: "Work",
    labelName: "work",
    defaultAction: "keep_inbox",
    safetyTier: "review",
  },
  {
    slug: "personal",
    name: "Personal",
    labelName: "personal",
    defaultAction: "keep_inbox",
    safetyTier: "review",
  },
  {
    slug: "newsletters",
    name: "Newsletters",
    labelName: "newsletters",
    defaultAction: "ask_first",
    safetyTier: "safe_auto",
  },
  {
    slug: "promotions",
    name: "Promotions",
    labelName: "promotions",
    defaultAction: "ask_first",
    safetyTier: "safe_auto",
  },
  {
    slug: "receipts",
    name: "Receipts",
    labelName: "receipts",
    defaultAction: "ask_first",
    safetyTier: "safe_auto",
  },
  {
    slug: "spam",
    name: "Spam",
    labelName: "SPAM",
    defaultAction: "never_archive",
    safetyTier: "never_auto",
  },
  {
    slug: "work_device_sign_in",
    name: "Work device sign-in",
    labelName: "security/work-device-sign-in",
    defaultAction: "ask_first",
    safetyTier: "review",
  },
];

export const SAFETY_TIER_LABELS: Record<SafetyTier, string> = {
  safe_auto: "Safe to propose archive",
  review: "Review before archive",
  never_auto: "Never auto-archive",
};

export const ACTION_POLICY_LABELS: Record<CategoryActionPolicy, string> = {
  keep_inbox: "Keep in inbox",
  archive: "Archive when approved",
  ask_first: "Ask first (Cleanup review)",
  nudge: "Nudge until resolved",
  never_archive: "Never archive",
};
