import { describe, expect, it } from "vitest";
import { actionTakenLabel } from "@/lib/actionLogTypes";
import {
  blockedExplanation,
  resolutionStatusLabel,
} from "@/lib/resolutionPresentation";

describe("resolutionPresentation", () => {
  it("labels resolution statuses for display", () => {
    expect(resolutionStatusLabel("blocked")).toBe("Archive blocked");
    expect(resolutionStatusLabel("unresolved")).toBe("Awaiting decision");
  });

  it("prefers reason summary for blocked copy", () => {
    expect(
      blockedExplanation({
        summary:
          "Matched your taught archive rule, but did not archive because password recovery was mentioned.",
        block_reason: "hard_stop_password_changed",
      })
    ).toContain("password recovery");
  });

  it("labels audit actions", () => {
    expect(actionTakenLabel("archive_blocked")).toBe("Archive blocked");
    expect(actionTakenLabel("teach")).toBe("Preference taught");
  });
});
