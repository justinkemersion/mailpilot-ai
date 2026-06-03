import { requestOrigin } from "@/lib/auth/request-origin";
import { NextResponse } from "next/server";

/**
 * Ensures the browser has a NextAuth CSRF cookie, then returns to /login.
 * Route handlers can forward Set-Cookie; Server Components cannot.
 */
export async function GET(request: Request) {
  const origin = requestOrigin(request);

  const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
    headers: { Cookie: request.headers.get("cookie") ?? "" },
  });

  if (!csrfRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=csrf`);
  }

  const response = NextResponse.redirect(`${origin}/login`);
  const setCookies =
    typeof csrfRes.headers.getSetCookie === "function"
      ? csrfRes.headers.getSetCookie()
      : [];

  for (const raw of setCookies) {
    response.headers.append("Set-Cookie", raw);
  }

  return response;
}
