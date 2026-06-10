import { isDemoRequest } from "./session";
import { NextResponse } from "next/server";

export class DemoModeBlockedError extends Error {
  constructor(public readonly operation: string) {
    super(`Demo mode blocked: ${operation}`);
    this.name = "DemoModeBlockedError";
  }
}

export function demoModeBlockedResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "Demo mode" }, { status: 403 });
}

export async function assertNotDemoMode(operation: string): Promise<void> {
  if (await isDemoRequest()) {
    throw new DemoModeBlockedError(operation);
  }
}

/** Returns a 403 response in demo mode, otherwise null (caller continues). */
export async function blockIfDemoMode(): Promise<NextResponse | null> {
  if (await isDemoRequest()) return demoModeBlockedResponse();
  return null;
}
