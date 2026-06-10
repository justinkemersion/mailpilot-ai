import {
  isDemoFeatureEnabled,
  setDemoSessionCookie,
} from "@/lib/demo";
import { NextResponse } from "next/server";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function GET() {
  if (!isDemoFeatureEnabled()) {
    return NextResponse.redirect(`${appOrigin()}/login`);
  }

  const response = NextResponse.redirect(`${appOrigin()}/dashboard/overview`);
  setDemoSessionCookie(response);
  return response;
}
