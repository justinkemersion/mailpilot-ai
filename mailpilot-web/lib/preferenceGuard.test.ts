import { describe, expect, it } from "vitest";
import {
  buildTeachCompositeMatch,
  validatePreferenceWrite,
} from "@/lib/preferenceGuard";

describe("preferenceGuard", () => {
  it("builds composite teach match from message fields", () => {
    const built = buildTeachCompositeMatch({
      category: "newsletters",
      subject: "New sign-in from Gmail on Chris-MBP",
      sender: "Google <no-reply@accounts.google.com>",
    });
    expect(built.match_type).toBe("composite");
    expect(built.match_conditions_json.sender_domain).toBe("accounts.google.com");
    expect(built.match_conditions_json.category_slug).toBe("newsletters");
    expect(built.match_conditions_json.subject_contains?.length).toBeGreaterThan(0);
  });

  it("rejects domain-only archive preference for important mail", () => {
    const result = validatePreferenceWrite({
      account_id: 1,
      match_type: "sender_domain",
      match_conditions_json: { sender_domain: "google.com" },
      action_policy: "archive",
      category_slug: "important",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts composite archive preference for work device sign-in", () => {
    const result = validatePreferenceWrite({
      account_id: 1,
      match_type: "composite",
      match_conditions_json: {
        sender_domain: "accounts.google.com",
        subject_contains: ["sign-in", "new device"],
        category_slug: "work_device_sign_in",
      },
      action_policy: "archive",
      category_slug: "work_device_sign_in",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects teach-style domain-only archive for security category", () => {
    const result = validatePreferenceWrite({
      account_id: 2,
      match_type: "composite",
      match_conditions_json: {
        sender_domain: "google.com",
        category_slug: "important",
      },
      action_policy: "archive",
      category_slug: "important",
    });
    expect(result.ok).toBe(false);
  });
});
