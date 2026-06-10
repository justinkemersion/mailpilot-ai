import { clearDemoSessionCookie } from "@/lib/demo";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearDemoSessionCookie(response);
  return response;
}
