/** Strip trailing slash so URL comparisons and OAuth redirects stay consistent. */
function normalizeOrigin(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  return url.trim().replace(/\/$/, "");
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * NextAuth uses NEXTAUTH_URL for OAuth callback URLs and session cookies.
 * Local .env files often copy production NEXTAUTH_URL while NEXT_PUBLIC_APP_URL
 * points at localhost — sign-in completes but the session never sticks locally.
 *
 * With AUTH_TRUST_HOST=true, unset localhost NEXTAUTH_URL so callbacks follow the
 * request Host header (laptop localhost or phone LAN IP).
 */
export function ensureAuthUrlForRuntime(): void {
  if (process.env.NODE_ENV !== "development") return;

  const appUrl = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const authUrl = normalizeOrigin(process.env.NEXTAUTH_URL);
  const trustHost = process.env.AUTH_TRUST_HOST === "true";

  if (trustHost && authUrl) {
    try {
      if (isLocalHost(new URL(authUrl).hostname)) {
        delete process.env.NEXTAUTH_URL;
        return;
      }
    } catch {
      return;
    }
  }

  if (!appUrl || !authUrl) return;

  try {
    const app = new URL(appUrl);
    const auth = new URL(authUrl);
    if (app.origin === auth.origin) return;

    if (isLocalHost(app.hostname) && !isLocalHost(auth.hostname)) {
      console.warn(
        `[mailpilot auth] NEXTAUTH_URL (${authUrl}) is not local; using ${appUrl} for laptop dev.`
      );
      process.env.NEXTAUTH_URL = appUrl;
      return;
    }

    if (isLocalHost(app.hostname) && isLocalHost(auth.hostname)) {
      console.warn(
        `[mailpilot auth] Aligning NEXTAUTH_URL to NEXT_PUBLIC_APP_URL (${appUrl}).`
      );
      process.env.NEXTAUTH_URL = appUrl;
    }
  } catch {
    /* ignore invalid URLs */
  }
}
