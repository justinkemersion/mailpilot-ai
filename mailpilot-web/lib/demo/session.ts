import type { MailpilotUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const DEMO_COOKIE_NAME = "mailpilot_demo";
export const DEMO_USER_ID = "demo:chris";

export const DEMO_USER: MailpilotUser = {
  id: DEMO_USER_ID,
  email: "demo@mailpilot.local",
  name: "Chris",
};

const TRUTHY = new Set(["true", "1"]);

function envTruthy(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value != null && TRUTHY.has(value);
}

/** Server authority: demo entry routes may run. Never reads NEXT_PUBLIC_* */
export function isDemoFeatureEnabled(): boolean {
  const explicit = process.env.ENABLE_DEMO_MODE?.trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return false;
  if (explicit === "true" || explicit === "1") return true;
  return process.env.NODE_ENV === "development";
}

/** Client UI hint only — shows login CTA; does not authorize /demo/enter */
export function isDemoEntryUiEnabled(): boolean {
  if (envTruthy("NEXT_PUBLIC_ENABLE_DEMO_MODE")) return true;
  return isDemoFeatureEnabled();
}

/** Legacy operator / screenshot mode — not production visitor demo */
export function isGlobalDemoMode(): boolean {
  return envTruthy("MAILPILOT_DEMO_MODE");
}

/** Legacy banner env for operator deploys */
export function isDemoBannerEnabled(): boolean {
  return envTruthy("NEXT_PUBLIC_DEMO_BANNER");
}

export function isDemoRequestFromNextRequest(req: NextRequest): boolean {
  if (req.cookies.get(DEMO_COOKIE_NAME)?.value === "1") return true;
  return isGlobalDemoMode();
}

export async function isDemoCookieSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_COOKIE_NAME)?.value === "1";
}

export async function isDemoRequest(): Promise<boolean> {
  if (isGlobalDemoMode()) return true;
  return isDemoCookieSession();
}

/** @deprecated Use isDemoRequest() */
export async function isDemoMode(): Promise<boolean> {
  return isDemoRequest();
}

export function isDemoUser(user: MailpilotUser | null | undefined): boolean {
  return user?.id === DEMO_USER_ID;
}

export async function getDemoSessionUser(): Promise<MailpilotUser | null> {
  if (!(await isDemoCookieSession())) return null;
  if (!isDemoFeatureEnabled()) return null;
  return { ...DEMO_USER };
}

export function setDemoSessionCookie(response: NextResponse): void {
  response.cookies.set(DEMO_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearDemoSessionCookie(response: NextResponse): void {
  response.cookies.set(DEMO_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
