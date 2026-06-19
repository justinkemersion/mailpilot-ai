import { describe, expect, it } from "vitest";
import {
  buildGmailAccountUpsertPayload,
  DISCONNECTED_TOKEN_JSON,
  GMAIL_PROVIDER,
  isMailboxReconnect,
  isValidMailboxEmail,
  mailboxIdentity,
  normalizeMailboxEmail,
} from "@/lib/mailboxIdentity";

describe("normalizeMailboxEmail", () => {
  it("trimms and lowercases", () => {
    expect(normalizeMailboxEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("validates mailbox emails", () => {
    expect(isValidMailboxEmail("a@b.co")).toBe(true);
    expect(isValidMailboxEmail("")).toBe(false);
    expect(isValidMailboxEmail("not-an-email")).toBe(false);
  });
});

describe("mailboxIdentity", () => {
  it("uses gmail provider by default", () => {
    expect(mailboxIdentity("google:1", "Me@Mail.com")).toEqual({
      user_id: "google:1",
      provider: GMAIL_PROVIDER,
      normalized_email: "me@mail.com",
    });
  });
});

describe("isMailboxReconnect", () => {
  it("is false for first connect", () => {
    expect(isMailboxReconnect(null)).toBe(false);
  });

  it("is true when inactive or needs reauth", () => {
    expect(
      isMailboxReconnect({
        id: 1,
        active: false,
        scope_configured_at: null,
        needs_reauth: true,
      })
    ).toBe(true);
    expect(
      isMailboxReconnect({
        id: 1,
        active: false,
        scope_configured_at: null,
      })
    ).toBe(true);
  });

  it("is true when scope was configured", () => {
    expect(
      isMailboxReconnect({
        id: 1,
        active: true,
        scope_configured_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("is false for active unconfigured mailbox", () => {
    expect(
      isMailboxReconnect({
        id: 1,
        active: true,
        scope_configured_at: null,
      })
    ).toBe(false);
  });
});

describe("buildGmailAccountUpsertPayload", () => {
  const tokenJson = '{"refresh_token":"rt"}';

  it("builds stable identity upsert for first connect", () => {
    const payload = buildGmailAccountUpsertPayload({
      userId: "google:42",
      email: "User@Gmail.com",
      displayName: "User",
      tokenJson,
      updatedAt: "2026-06-19T12:00:00.000Z",
    });

    expect(payload.user_id).toBe("google:42");
    expect(payload.provider).toBe(GMAIL_PROVIDER);
    expect(payload.normalized_email).toBe("user@gmail.com");
    expect(payload.email).toBe("User@Gmail.com");
    expect(payload.token_json).toBe(tokenJson);
    expect(payload.active).toBe(true);
    expect(payload.needs_reauth).toBe(false);
    expect(payload).not.toHaveProperty("purpose");
    expect(payload).not.toHaveProperty("scope_configured_at");
  });

  it("creates distinct identities for different emails", () => {
    const a = buildGmailAccountUpsertPayload({
      userId: "google:1",
      email: "a@x.com",
      displayName: null,
      tokenJson,
    });
    const b = buildGmailAccountUpsertPayload({
      userId: "google:1",
      email: "b@x.com",
      displayName: null,
      tokenJson,
    });
    expect(a.normalized_email).not.toBe(b.normalized_email);
  });

  it("reconnect replaces credentials on same normalized email", () => {
    const first = buildGmailAccountUpsertPayload({
      userId: "google:1",
      email: "same@x.com",
      displayName: "A",
      tokenJson: '{"refresh_token":"old"}',
    });
    const second = buildGmailAccountUpsertPayload({
      userId: "google:1",
      email: "Same@X.com",
      displayName: "B",
      tokenJson: '{"refresh_token":"new"}',
    });
    expect(first.normalized_email).toBe(second.normalized_email);
    expect(second.token_json).toBe('{"refresh_token":"new"}');
  });
});

describe("DISCONNECTED_TOKEN_JSON", () => {
  it("is empty string for NOT NULL column", () => {
    expect(DISCONNECTED_TOKEN_JSON).toBe("");
  });
});
