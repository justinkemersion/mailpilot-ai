import type {
  CompositeMatchConditions,
  PreferenceMatchType,
} from "@/lib/preferenceGuard";

export interface PreferenceMatchInput {
  enabled: boolean;
  match_type: PreferenceMatchType;
  match_conditions_json: CompositeMatchConditions;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function senderAddress(sender: string | null | undefined): string | null {
  if (!sender?.trim()) return null;
  const text = sender.trim();
  const angle = text.match(/^.+?<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  if (text.includes("@")) return text.toLowerCase();
  return null;
}

function senderDomain(sender: string | null | undefined): string | null {
  const address = senderAddress(sender);
  if (!address) return null;
  const at = address.indexOf("@");
  if (at < 0) return null;
  return address.slice(at + 1).toLowerCase();
}

function subjectMatches(subject: string | null | undefined, phrases: string[]): boolean {
  const haystack = normalize(subject);
  if (!haystack) return false;
  return phrases
    .filter((phrase) => phrase.trim())
    .every((phrase) => haystack.includes(normalize(phrase)));
}

export function preferenceMatchesMessage(
  preference: PreferenceMatchInput,
  message: {
    category: string;
    subject: string | null;
    sender: string | null;
  }
): boolean {
  if (!preference.enabled) return false;

  const conditions = preference.match_conditions_json ?? {};
  const matchType = preference.match_type;

  if (matchType === "category") {
    const slug = conditions.category_slug ?? (conditions as { category?: string }).category;
    return slug === message.category;
  }

  if (matchType === "sender") {
    const expected = normalize(conditions.sender);
    return Boolean(expected) && senderAddress(message.sender) === expected;
  }

  if (matchType === "sender_domain") {
    const expected = normalize(conditions.sender_domain);
    return Boolean(expected) && senderDomain(message.sender) === expected;
  }

  if (matchType === "subject_pattern") {
    const pattern = conditions.subject_pattern ?? (conditions as { pattern?: string }).pattern;
    if (!pattern || !message.subject) return false;
    return new RegExp(String(pattern), "i").test(message.subject);
  }

  if (matchType === "composite") {
    const slug = conditions.category_slug;
    if (slug && slug !== message.category) return false;

    const domain = conditions.sender_domain;
    if (domain && senderDomain(message.sender) !== normalize(domain)) return false;

    const expectedSender = conditions.sender;
    if (expectedSender && senderAddress(message.sender) !== normalize(expectedSender)) {
      return false;
    }

    const phrases = conditions.subject_contains;
    if (Array.isArray(phrases) && phrases.length > 0 && !subjectMatches(message.subject, phrases)) {
      return false;
    }

    const pattern = conditions.subject_pattern;
    if (pattern && message.subject && !new RegExp(String(pattern), "i").test(message.subject)) {
      return false;
    }

    return true;
  }

  return false;
}

/** Convenience wrapper using parseSender for tests and callers that prefer it. */
export function preferenceMatchesEmailRow(
  preference: PreferenceMatchInput,
  row: { category: string; subject: string | null; sender: string | null }
): boolean {
  return preferenceMatchesMessage(preference, row);
}
