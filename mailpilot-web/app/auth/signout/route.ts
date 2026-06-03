import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/api/auth/signout?callbackUrl=/login`, {
    status: 302,
  });
}
