import { requestOrigin } from "@/lib/auth/request-origin";
import { NextResponse } from "next/server";

function internalOrigin(): string {
  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

function forwardedHeaders(request: Request, origin: string): HeadersInit {
  const url = new URL(origin);
  return {
    Cookie: request.headers.get("cookie") ?? "",
    Host: url.host,
    "X-Forwarded-Host": url.host,
    "X-Forwarded-Proto": url.protocol.replace(":", ""),
  };
}

/** Only forward CSRF cookies — internal fetch also sets callback-url for 127.0.0.1. */
function isCsrfSetCookie(setCookie: string): boolean {
  const name = setCookie.split("=", 1)[0]?.trim().toLowerCase();
  return (
    name === "next-auth.csrf-token" ||
    name === "__host-next-auth.csrf-token"
  );
}

/**
 * Ensures the browser has a NextAuth CSRF cookie, then returns to /login.
 * Route handlers can forward Set-Cookie; Server Components cannot.
 */
export async function GET(request: Request) {
  const origin = requestOrigin(request);

  const csrfRes = await fetch(`${internalOrigin()}/api/auth/csrf`, {
    headers: forwardedHeaders(request, origin),
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
    if (isCsrfSetCookie(raw)) {
      response.headers.append("Set-Cookie", raw);
    }
  }

  return response;
}
