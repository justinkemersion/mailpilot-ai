import { isDemoMode } from "@/lib/demo";
import { NextResponse } from "next/server";

export function demoModeBlockedResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "Demo mode" }, { status: 403 });
}

/** Returns a 403 response in demo mode, otherwise null (caller continues). */
export function blockIfDemoMode(): NextResponse | null {
  if (isDemoMode()) return demoModeBlockedResponse();
  return null;
}
