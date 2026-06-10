import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_COOKIE_NAME,
  isDemoEntryUiEnabled,
  isDemoFeatureEnabled,
  isDemoRequestFromNextRequest,
  isGlobalDemoMode,
} from "@/lib/demo/session";

describe("isDemoFeatureEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is enabled in development by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isDemoFeatureEnabled()).toBe(true);
  });

  it("is disabled in production without ENABLE_DEMO_MODE", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDemoFeatureEnabled()).toBe(false);
  });

  it("is enabled in production when ENABLE_DEMO_MODE=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_MODE", "true");
    expect(isDemoFeatureEnabled()).toBe(true);
  });

  it("can be disabled in development with ENABLE_DEMO_MODE=false", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEMO_MODE", "false");
    expect(isDemoFeatureEnabled()).toBe(false);
  });

  it("does not read NEXT_PUBLIC_ENABLE_DEMO_MODE for server authority", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_MODE", "true");
    expect(isDemoFeatureEnabled()).toBe(false);
  });
});

describe("isDemoEntryUiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows UI when NEXT_PUBLIC flag is set even if server disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_MODE", "true");
    expect(isDemoEntryUiEnabled()).toBe(true);
    expect(isDemoFeatureEnabled()).toBe(false);
  });
});

describe("isGlobalDemoMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is operator/screenshot mode only", () => {
    vi.stubEnv("MAILPILOT_DEMO_MODE", "true");
    expect(isGlobalDemoMode()).toBe(true);
  });
});

describe("isDemoRequestFromNextRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects demo cookie on request", () => {
    const req = {
      cookies: {
        get: (name: string) =>
          name === DEMO_COOKIE_NAME ? { value: "1" } : undefined,
      },
    } as Parameters<typeof isDemoRequestFromNextRequest>[0];

    expect(isDemoRequestFromNextRequest(req)).toBe(true);
  });

  it("detects global operator mode without cookie", () => {
    vi.stubEnv("MAILPILOT_DEMO_MODE", "true");
    const req = {
      cookies: { get: () => undefined },
    } as Parameters<typeof isDemoRequestFromNextRequest>[0];

    expect(isDemoRequestFromNextRequest(req)).toBe(true);
  });
});
