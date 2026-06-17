import type { CategoryActionPolicy } from "@/lib/categoryPolicy";
import type {
  CompositeMatchConditions,
  PreferenceMatchType,
} from "@/lib/preferenceGuard";

export interface MailPreferenceRow {
  id: number;
  user_id: string;
  account_id: number;
  match_type: PreferenceMatchType;
  match_conditions_json: CompositeMatchConditions;
  category_id: number | null;
  action_policy: CategoryActionPolicy;
  confidence_threshold: number | null;
  source: "user" | "system_seed";
  enabled: boolean;
  created_at: string;
  updated_at: string;
  accounts?: { email: string } | { email: string }[] | null;
}

export const PREFERENCE_SELECT =
  "id,user_id,account_id,match_type,match_conditions_json,category_id,action_policy,confidence_threshold,source,enabled,created_at,updated_at";

export function accountEmailFromPreference(row: MailPreferenceRow): string | null {
  if (!row.accounts) return null;
  return Array.isArray(row.accounts) ? row.accounts[0]?.email ?? null : row.accounts.email;
}

export function preferenceSummary(row: MailPreferenceRow): string {
  const email = accountEmailFromPreference(row);
  const mailbox = email ? ` on ${email}` : "";
  const policy = row.action_policy.replace("_", " ");
  const slug = row.match_conditions_json.category_slug;
  if (slug) {
    return `${policy} for ${slug}${mailbox}`;
  }
  return `${policy} rule${mailbox}`;
}
