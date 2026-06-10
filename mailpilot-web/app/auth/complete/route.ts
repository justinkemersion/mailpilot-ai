import { clearDemoSessionCookie } from "@/lib/demo";
import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/** Post-OAuth landing — clears demo cookie so real login wins. */
export async function GET() {
  const user = await getCurrentUser();
  const origin = appOrigin();

  if (!user) {
    redirect("/login");
  }

  const response = NextResponse.redirect(`${origin}/dashboard`);
  clearDemoSessionCookie(response);
  return response;
}
