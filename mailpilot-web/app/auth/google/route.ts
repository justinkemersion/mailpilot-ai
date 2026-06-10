import { clearDemoSessionCookie, isDemoRequest } from "@/lib/demo";
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
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not set in environment." },
      { status: 500 }
    );
  }

  if (await isDemoRequest()) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts`);
  }

  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID is not set in environment." },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  const response = NextResponse.redirect(googleAuthUrl);
  clearDemoSessionCookie(response);
  return response;
}
