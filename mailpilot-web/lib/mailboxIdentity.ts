/** Gmail mailbox provider slug stored on api.accounts.provider. */
export const GMAIL_PROVIDER = "gmail";

/** Cleared token_json sentinel for soft-disconnected accounts (column is NOT NULL). */
export const DISCONNECTED_TOKEN_JSON = "";

/**
 * Normalize a mailbox email for stable identity matching.
 * Provider profile emails should be trimmed and lowercased before storage/compare.
 */
export function normalizeMailboxEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidMailboxEmail(email: string): boolean {
  const normalized = normalizeMailboxEmail(email);
  return normalized.length > 0 && normalized.includes("@");
}

export interface MailboxIdentity {
  user_id: string;
  provider: string;
  normalized_email: string;
}

export function mailboxIdentity(
  userId: string,
  email: string,
  provider: string = GMAIL_PROVIDER
): MailboxIdentity {
  return {
    user_id: userId,
    provider,
    normalized_email: normalizeMailboxEmail(email),
  };
}

export interface ExistingMailboxRow {
  id: number;
  active: boolean;
  scope_configured_at: string | null;
  needs_reauth?: boolean;
}

/**
 * True when OAuth reconnect should preserve history messaging (not a fresh mailbox).
 */
export function isMailboxReconnect(existing: ExistingMailboxRow | null | undefined): boolean {
  if (!existing) return false;
  if (!existing.active || existing.needs_reauth) return true;
  if (existing.scope_configured_at != null) return true;
  return false;
}

export interface GmailAccountUpsertPayload {
  user_id: string;
  provider: string;
  normalized_email: string;
  email: string;
  display_name: string | null;
  token_json: string;
  active: true;
  needs_reauth: false;
  updated_at: string;
}

export function buildGmailAccountUpsertPayload(params: {
  userId: string;
  email: string;
  displayName: string | null | undefined;
  tokenJson: string;
  updatedAt?: string;
}): GmailAccountUpsertPayload {
  const normalizedEmail = normalizeMailboxEmail(params.email);
  return {
    user_id: params.userId,
    provider: GMAIL_PROVIDER,
    normalized_email: normalizedEmail,
    email: params.email.trim(),
    display_name: params.displayName ?? null,
    token_json: params.tokenJson,
    active: true,
    needs_reauth: false,
    updated_at: params.updatedAt ?? new Date().toISOString(),
  };
}
