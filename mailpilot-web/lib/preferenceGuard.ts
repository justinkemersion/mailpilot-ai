import { parseSender } from "@/lib/emailActivity";
import type { CategoryActionPolicy } from "@/lib/categoryPolicy";

export type PreferenceMatchType =
  | "sender"
  | "sender_domain"
  | "subject_pattern"
  | "category"
  | "composite";

export interface CompositeMatchConditions {
  sender?: string;
  sender_domain?: string;
  subject_contains?: string[];
  subject_pattern?: string;
  category_slug?: string;
}

export interface PreferenceWriteInput {
  account_id: number;
  match_type: PreferenceMatchType;
  match_conditions_json: CompositeMatchConditions;
  action_policy: CategoryActionPolicy;
  category_id?: number | null;
  category_slug?: string | null;
}

/** Categories where archive prefs must use composite match (not domain-only). */
export const SENSITIVE_ARCHIVE_CATEGORY_SLUGS = new Set([
  "important",
  "work_device_sign_in",
  "work",
  "personal",
  "receipts",
]);

const ACTION_POLICIES = new Set<CategoryActionPolicy>([
  "keep_inbox",
  "archive",
  "ask_first",
  "nudge",
  "never_archive",
]);

const MATCH_TYPES = new Set<PreferenceMatchType>([
  "sender",
  "sender_domain",
  "subject_pattern",
  "category",
  "composite",
]);

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function subjectPhrases(subject: string | null | undefined, max = 3): string[] {
  const text = normalizeText(subject);
  if (!text) return [];

  const phrases: string[] = [];
  const lower = text;
  if (lower.includes("sign-in") || lower.includes("sign in")) {
    phrases.push("sign-in");
  }
  if (lower.includes("new device")) {
    phrases.push("new device");
  }
  if (lower.includes("password")) {
    phrases.push("password");
  }

  if (phrases.length >= max) return phrases.slice(0, max);

  const words = lower
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  for (const word of words) {
    if (!phrases.includes(word)) phrases.push(word);
    if (phrases.length >= max) break;
  }
  return phrases.slice(0, max);
}

export function buildTeachCompositeMatch(input: {
  category: string;
  subject: string | null;
  sender: string | null;
}): {
  match_type: "composite";
  match_conditions_json: CompositeMatchConditions;
} {
  const { address } = parseSender(input.sender);
  const domain = address?.split("@")[1]?.toLowerCase() ?? undefined;
  const phrases = subjectPhrases(input.subject);
  const conditions: CompositeMatchConditions = {
    category_slug: input.category,
  };
  if (domain) conditions.sender_domain = domain;
  if (phrases.length > 0) conditions.subject_contains = phrases;
  if (address) conditions.sender = address.toLowerCase();

  return {
    match_type: "composite",
    match_conditions_json: conditions,
  };
}

function categorySlugForValidation(input: PreferenceWriteInput): string | null {
  if (input.category_slug) return input.category_slug;
  const slug = input.match_conditions_json.category_slug;
  return slug ?? null;
}

export function validatePreferenceWrite(
  input: PreferenceWriteInput
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.account_id) || input.account_id <= 0) {
    return { ok: false, error: "account_id must be a positive integer" };
  }
  if (!MATCH_TYPES.has(input.match_type)) {
    return { ok: false, error: "Invalid match_type" };
  }
  if (!ACTION_POLICIES.has(input.action_policy)) {
    return { ok: false, error: "Invalid action_policy" };
  }
  if (
    !input.match_conditions_json ||
    typeof input.match_conditions_json !== "object" ||
    Array.isArray(input.match_conditions_json)
  ) {
    return { ok: false, error: "match_conditions_json must be an object" };
  }

  const categorySlug = categorySlugForValidation(input);
  const conditions = input.match_conditions_json;

  if (input.action_policy !== "archive") {
    return { ok: true };
  }

  if (input.match_type === "sender_domain" && !conditions.sender_domain) {
    return { ok: false, error: "sender_domain match requires sender_domain in conditions" };
  }

  const sensitive =
    categorySlug !== null && SENSITIVE_ARCHIVE_CATEGORY_SLUGS.has(categorySlug);

  if (sensitive && input.match_type !== "composite") {
    return {
      ok: false,
      error: "Archive preferences for sensitive categories require composite match",
    };
  }

  if (categorySlug === "work_device_sign_in") {
    if (input.match_type !== "composite") {
      return {
        ok: false,
        error: "Work device sign-in archive rules require composite match",
      };
    }
    if (!conditions.sender_domain) {
      return { ok: false, error: "Work device sign-in rules require sender_domain" };
    }
    if (!Array.isArray(conditions.subject_contains) || conditions.subject_contains.length === 0) {
      return { ok: false, error: "Work device sign-in rules require subject_contains phrases" };
    }
    if (conditions.category_slug !== "work_device_sign_in") {
      return { ok: false, error: "Work device sign-in rules require category_slug work_device_sign_in" };
    }
  }

  if (sensitive && input.match_type === "composite") {
    const hasSubjectScope =
      Array.isArray(conditions.subject_contains) && conditions.subject_contains.length > 0;
    const hasSenderScope = Boolean(conditions.sender);
    if (!hasSubjectScope && !hasSenderScope) {
      return {
        ok: false,
        error:
          "Composite archive preferences for sensitive mail require sender or subject scope",
      };
    }
  }

  if (
    input.match_type === "sender_domain" &&
    conditions.sender_domain &&
    !conditions.category_slug &&
    !conditions.subject_contains?.length
  ) {
    return {
      ok: false,
      error: "Domain-only archive preferences are not allowed without category or subject scope",
    };
  }

  return { ok: true };
}

export function isCategoryActionPolicy(value: unknown): value is CategoryActionPolicy {
  return typeof value === "string" && ACTION_POLICIES.has(value as CategoryActionPolicy);
}

export function isPreferenceMatchType(value: unknown): value is PreferenceMatchType {
  return typeof value === "string" && MATCH_TYPES.has(value as PreferenceMatchType);
}
