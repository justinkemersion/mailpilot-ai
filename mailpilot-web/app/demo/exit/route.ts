import { clearDemoSessionCookie } from "@/lib/demo";
import { NextResponse } from "next/server";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next");
  const destination =
    next && next.startsWith("/") && !next.startsWith("//")
      ? `${appOrigin()}${next}`
      : `${appOrigin()}/login`;

  const response = NextResponse.redirect(destination);
  clearDemoSessionCookie(response);
  return response;
}
