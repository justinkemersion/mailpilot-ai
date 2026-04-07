import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  email: string;
  name?: string;
}

/**
 * Google OAuth callback.
 *
 * 1. Exchanges the authorization `code` for tokens (access + refresh).
 * 2. Calls Google's userinfo endpoint to get the Gmail address and display name.
 * 3. Upserts a row in public.accounts so the Python runner can pick it up.
 *
 * token_json is stored as a JSON string matching the format expected by
 * google.oauth2.credentials.Credentials.from_authorized_user_info() in Phase 3:
 *   { refresh_token, token_uri, client_id, client_secret }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=google_no_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/auth/google/callback`;

  // --- Step 1: exchange code for tokens ---
  let tokens: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("Google token exchange failed:", detail);
      return NextResponse.redirect(
        `${appUrl}/dashboard?error=google_token_exchange`
      );
    }

    tokens = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (err) {
    console.error("Google token exchange error:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=google_token_exchange`
    );
  }

  if (!tokens.refresh_token) {
    // This happens if the user previously granted access and Google skipped consent.
    // The route.ts initiator uses prompt=consent so this shouldn't occur in normal
    // use, but handle it gracefully.
    console.error("Google did not return a refresh_token.");
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=google_no_refresh_token`
    );
  }

  // --- Step 2: get the user's Gmail address and display name ---
  let userInfo: GoogleUserInfo;
  try {
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    if (!userRes.ok) {
      const detail = await userRes.text();
      console.error("Google userinfo failed:", detail);
      return NextResponse.redirect(
        `${appUrl}/dashboard?error=google_userinfo`
      );
    }

    userInfo = (await userRes.json()) as GoogleUserInfo;
  } catch (err) {
    console.error("Google userinfo error:", err);
    return NextResponse.redirect(`${appUrl}/dashboard?error=google_userinfo`);
  }

  // --- Step 3: upsert into public.accounts ---
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  // token_json format matches google.oauth2.credentials.Credentials.from_authorized_user_info()
  const tokenJson = JSON.stringify({
    refresh_token: tokens.refresh_token,
    token_uri: "https://oauth2.googleapis.com/token",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const { error: upsertError } = await supabase.from("accounts").upsert(
    {
      user_id: user.id,
      email: userInfo.email,
      display_name: userInfo.name ?? null,
      token_json: tokenJson,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,email" }
  );

  if (upsertError) {
    console.error("Supabase accounts upsert error:", upsertError);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=accounts_upsert`
    );
  }

  return NextResponse.redirect(`${appUrl}/dashboard?connected=true`);
}
