import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PURPOSES,
  DEFAULT_ARCHIVE_POLICIES,
  isAccountPurpose,
  isDefaultArchivePolicy,
  isSecurityPosture,
  SECURITY_POSTURES,
  suggestedScopeForPurpose,
} from "@/lib/accountScope";

describe("accountScope", () => {
  it("validates purpose enum", () => {
    expect(isAccountPurpose("personal")).toBe(true);
    expect(isAccountPurpose("archive")).toBe(false);
  });

  it("validates default archive policy without account-level archive", () => {
    for (const p of DEFAULT_ARCHIVE_POLICIES) {
      expect(isDefaultArchivePolicy(p)).toBe(true);
    }
    expect(isDefaultArchivePolicy("archive")).toBe(false);
    expect((DEFAULT_ARCHIVE_POLICIES as readonly string[]).includes("archive")).toBe(
      false
    );
  });

  it("validates security posture enum", () => {
    expect(isSecurityPosture("relaxed")).toBe(true);
    expect(isSecurityPosture("paranoid")).toBe(false);
  });

  it("suggests relaxed posture for work delivery", () => {
    expect(suggestedScopeForPurpose("work_delivery").security_posture).toBe("relaxed");
  });

  it("covers all account purposes", () => {
    expect(ACCOUNT_PURPOSES.length).toBe(4);
    expect(SECURITY_POSTURES.length).toBe(3);
  });
});
