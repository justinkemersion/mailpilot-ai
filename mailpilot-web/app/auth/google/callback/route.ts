import { getCurrentUser } from "@/lib/auth/session";
import { isDemoRequest } from "@/lib/demo";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import {
  buildGmailAccountUpsertPayload,
  isMailboxReconnect,
  type ExistingMailboxRow,
} from "@/lib/mailboxIdentity";
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
 * 3. Upserts a row in api.accounts on stable identity (user_id + provider + normalized_email)
 *    so reconnect preserves sync history, scope, rules, and preferences.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (await isDemoRequest()) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=google_no_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/auth/google/callback`;

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
    console.error("Google did not return a refresh_token.");
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=google_no_refresh_token`
    );
  }

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

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const tokenJson = JSON.stringify({
    refresh_token: tokens.refresh_token,
    token_uri: "https://oauth2.googleapis.com/token",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const upsertBody = buildGmailAccountUpsertPayload({
    userId: user.id,
    email: userInfo.email,
    displayName: userInfo.name,
    tokenJson,
  });

  let existing: ExistingMailboxRow | null = null;
  try {
    const rows = await fluxJson<ExistingMailboxRow[]>(
      `/accounts${postgrestParams([
        ["select", "id,active,scope_configured_at,needs_reauth"],
        ["user_id", `eq.${user.id}`],
        ["provider", `eq.${upsertBody.provider}`],
        ["normalized_email", `eq.${upsertBody.normalized_email}`],
      ])}`
    );
    existing = rows[0] ?? null;
  } catch (err) {
    console.error("Flux accounts lookup before upsert:", err);
  }

  const reconnect = isMailboxReconnect(existing);

  try {
    await fluxJson(
      "/accounts?on_conflict=user_id,provider,normalized_email",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        json: upsertBody as unknown as Record<string, unknown>,
      }
    );
  } catch (err) {
    console.error("Flux accounts upsert error:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=accounts_upsert`
    );
  }

  const connectParam = reconnect ? "reconnected=true" : "connected=true";
  return NextResponse.redirect(`${appUrl}/dashboard?${connectParam}`);
}
