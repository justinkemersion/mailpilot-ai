import { describe, expect, it, vi } from "vitest";
import {
  assertNotDemoMode,
  DemoModeBlockedError,
} from "@/lib/demo/guards";

vi.mock("@/lib/demo/session", () => ({
  isDemoRequest: vi.fn(),
}));

import { isDemoRequest } from "@/lib/demo/session";

describe("assertNotDemoMode", () => {
  it("throws when demo request is active", async () => {
    vi.mocked(isDemoRequest).mockResolvedValue(true);
    await expect(assertNotDemoMode("flux write")).rejects.toBeInstanceOf(
      DemoModeBlockedError
    );
  });

  it("allows real requests", async () => {
    vi.mocked(isDemoRequest).mockResolvedValue(false);
    await expect(assertNotDemoMode("flux write")).resolves.toBeUndefined();
  });
});
