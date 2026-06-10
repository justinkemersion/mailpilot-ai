import { describe, expect, it } from "vitest";
import {
  buildSuccessSummary,
  buildTechnicalBreakdown,
  classifyRunOutcome,
} from "@/lib/runResultPresentation";

describe("classifyRunOutcome", () => {
  it("flags reauth_required when every account failed and nothing processed", () => {
    expect(
      classifyRunOutcome({
        accounts_processed: 3,
        processed: 0,
        accounts_needing_reauth: ["a@x.com", "b@x.com", "c@x.com"],
      })
    ).toBe("reauth_required");
  });

  it("flags partial reauth when some mail was processed", () => {
    expect(
      classifyRunOutcome({
        accounts_processed: 3,
        processed: 2,
        accounts_needing_reauth: ["stale@x.com"],
      })
    ).toBe("reauth_partial");
  });

  it("stays success when no reauth list", () => {
    expect(
      classifyRunOutcome({
        accounts_processed: 2,
        processed: 0,
        accounts_needing_reauth: [],
      })
    ).toBe("success");
  });
});

describe("buildSuccessSummary", () => {
  it("explains Gmail reconnect instead of a clean success line", () => {
    const summary = buildSuccessSummary(
      {
        accounts_processed: 3,
        processed: 0,
        accounts_needing_reauth: ["a@x.com", "b@x.com", "c@x.com"],
      },
      false
    );
    expect(summary).toContain("Gmail sign-in expired");
    expect(summary).toContain("Testing mode");
    expect(summary).not.toMatch(/^Run complete/);
  });
});

describe("buildTechnicalBreakdown", () => {
  it("lists accounts needing reconnect", () => {
    const lines = buildTechnicalBreakdown({
      accounts_processed: 2,
      candidates: 0,
      processed: 0,
      accounts_needing_reauth: ["stale@example.com"],
    });
    expect(lines.some((l) => l.includes("Needs Gmail reconnect: stale@example.com"))).toBe(
      true
    );
  });
});
