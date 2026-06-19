import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/accounts/disconnect-expired/route";
import { DISCONNECTED_TOKEN_JSON } from "@/lib/mailboxIdentity";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/demo", () => ({
  blockIfDemoMode: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/dashboard/queries", () => ({
  getConnectedAccounts: vi.fn(),
}));

vi.mock("@/lib/flux/client", () => ({
  fluxJson: vi.fn(),
  postgrestParams: vi.fn((entries: Array<[string, string]>) => {
    const params = new URLSearchParams();
    for (const [key, value] of entries) {
      params.append(key, value);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { getConnectedAccounts } from "@/lib/dashboard/queries";
import { fluxJson } from "@/lib/flux/client";

describe("POST /api/accounts/disconnect-expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "google:1",
      email: "owner@x.com",
      name: "Owner",
    });
    vi.mocked(getConnectedAccounts).mockResolvedValue([
      {
        id: 10,
        email: "stale@example.com",
        display_name: null,
        active: true,
        processing_enabled: true,
        purpose: "other",
        default_archive_policy: "ask_first",
        security_posture: "standard",
        scope_configured_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(fluxJson).mockResolvedValue([{ id: 10, email: "stale@example.com" }]);
  });

  it("soft-disconnects with PATCH, not DELETE", async () => {
    const res = await POST(
      new Request("http://localhost/api/accounts/disconnect-expired", {
        method: "POST",
        body: JSON.stringify({ emails: ["stale@example.com"] }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.disconnected).toEqual(["stale@example.com"]);
    expect(fluxJson).toHaveBeenCalledOnce();

    const [path, init] = vi.mocked(fluxJson).mock.calls[0];
    expect(path).toContain("/accounts");
    expect(init?.method).toBe("PATCH");
    expect(init?.json).toMatchObject({
      active: false,
      needs_reauth: true,
      token_json: DISCONNECTED_TOKEN_JSON,
    });
  });

  it("matches emails case-insensitively", async () => {
    await POST(
      new Request("http://localhost/api/accounts/disconnect-expired", {
        method: "POST",
        body: JSON.stringify({ emails: ["Stale@Example.com"] }),
      })
    );

    expect(fluxJson).toHaveBeenCalledOnce();
  });
});
