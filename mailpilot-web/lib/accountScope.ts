export const ACCOUNT_PURPOSES = [
  "personal",
  "work_delivery",
  "business",
  "other",
] as const;

export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

export const DEFAULT_ARCHIVE_POLICIES = [
  "keep_inbox",
  "ask_first",
  "never_archive",
] as const;

export type DefaultArchivePolicy = (typeof DEFAULT_ARCHIVE_POLICIES)[number];

export const SECURITY_POSTURES = ["strict", "standard", "relaxed"] as const;

export type SecurityPosture = (typeof SECURITY_POSTURES)[number];

export const ACCOUNT_PURPOSE_LABELS: Record<AccountPurpose, string> = {
  personal: "Personal",
  work_delivery: "Work / Delivery",
  business: "Business",
  other: "Other",
};

export const DEFAULT_ARCHIVE_POLICY_LABELS: Record<DefaultArchivePolicy, string> = {
  keep_inbox: "Keep labeled mail in inbox",
  ask_first: "Review before archiving",
  never_archive: "Never auto-archive",
};

export const SECURITY_POSTURE_LABELS: Record<SecurityPosture, string> = {
  strict: "Strict — extra caution for security mail",
  standard: "Standard",
  relaxed: "Relaxed — routine work-device notices expected",
};

export function isAccountPurpose(value: string): value is AccountPurpose {
  return (ACCOUNT_PURPOSES as readonly string[]).includes(value);
}

export function isDefaultArchivePolicy(value: string): value is DefaultArchivePolicy {
  return (DEFAULT_ARCHIVE_POLICIES as readonly string[]).includes(value);
}

export function isSecurityPosture(value: string): value is SecurityPosture {
  return (SECURITY_POSTURES as readonly string[]).includes(value);
}

/** Suggested defaults when the user picks a mailbox purpose. */
export function suggestedScopeForPurpose(purpose: AccountPurpose): {
  default_archive_policy: DefaultArchivePolicy;
  security_posture: SecurityPosture;
} {
  switch (purpose) {
    case "personal":
      return { default_archive_policy: "ask_first", security_posture: "strict" };
    case "work_delivery":
      return { default_archive_policy: "ask_first", security_posture: "relaxed" };
    case "business":
      return { default_archive_policy: "ask_first", security_posture: "standard" };
    default:
      return { default_archive_policy: "ask_first", security_posture: "standard" };
  }
}

export interface AccountScopeFields {
  purpose: AccountPurpose;
  default_archive_policy: DefaultArchivePolicy;
  security_posture: SecurityPosture;
  scope_configured_at: string | null;
}
