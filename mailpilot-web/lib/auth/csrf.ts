import { cookies } from "next/headers";

const CSRF_COOKIE_NAMES = [
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
] as const;

/** Read the NextAuth CSRF token already stored in the browser cookie jar. */
export function readCsrfTokenFromCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): string | null {
  for (const name of CSRF_COOKIE_NAMES) {
    const raw = cookieStore.get(name)?.value;
    if (!raw) continue;
    const token = decodeURIComponent(raw).split("|")[0]?.trim();
    if (token) return token;
  }
  return null;
}
