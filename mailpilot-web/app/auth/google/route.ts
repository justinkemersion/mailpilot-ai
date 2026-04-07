import { NextResponse } from "next/server";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

/**
 * Initiates the Google OAuth flow.
 * Redirects the user to Google's consent screen requesting gmail.modify scope
 * and offline access (so we receive a refresh_token we can hand to the Python runner).
 *
 * Middleware guarantees the user is already signed into Supabase before
 * they can reach this route.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_CLIENT_ID or NEXT_PUBLIC_APP_URL is not set in environment.",
      },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",   // ensures Google returns a refresh_token
    prompt: "consent",        // forces re-consent so refresh_token is always returned
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return NextResponse.redirect(googleAuthUrl);
}
