import { describe, expect, it } from "vitest";
import { preferenceMatchesMessage } from "@/lib/preferenceMatcher";

const compositePref = {
  enabled: true,
  match_type: "composite" as const,
  match_conditions_json: {
    category_slug: "newsletters",
    sender_domain: "news.example.com",
    subject_contains: ["weekly"],
  },
};

describe("preferenceMatchesMessage", () => {
  it("matches composite when category, domain, and subject align", () => {
    expect(
      preferenceMatchesMessage(compositePref, {
        category: "newsletters",
        subject: "Your weekly digest",
        sender: "News <hello@news.example.com>",
      })
    ).toBe(true);
  });

  it("rejects composite when category differs", () => {
    expect(
      preferenceMatchesMessage(compositePref, {
        category: "receipts",
        subject: "Your weekly digest",
        sender: "News <hello@news.example.com>",
      })
    ).toBe(false);
  });

  it("ignores disabled preferences", () => {
    expect(
      preferenceMatchesMessage(
        { ...compositePref, enabled: false },
        {
          category: "newsletters",
          subject: "Your weekly digest",
          sender: "News <hello@news.example.com>",
        }
      )
    ).toBe(false);
  });

  it("matches sender_domain type", () => {
    expect(
      preferenceMatchesMessage(
        {
          enabled: true,
          match_type: "sender_domain",
          match_conditions_json: { sender_domain: "stripe.com" },
        },
        {
          category: "receipts",
          subject: "Receipt",
          sender: "Stripe <receipts@stripe.com>",
        }
      )
    ).toBe(true);
  });
});
