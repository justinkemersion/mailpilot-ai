import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface TokenJson {
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Refresh a Google OAuth access token using the stored refresh_token.
 * The token_json stored by the web app's OAuth callback matches
 * google.oauth2.credentials.Credentials.from_authorized_user_info() format.
 */
async function refreshAccessToken(tokenJson: TokenJson): Promise<string> {
  const res = await fetch(tokenJson.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenJson.refresh_token,
      client_id: tokenJson.client_id,
      client_secret: tokenJson.client_secret,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token refresh failed: ${detail}`);
  }

  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token");
  }
  return data.access_token;
}

/**
 * Call Gmail messages.modify to restore INBOX + UNREAD and remove applied labels.
 */
async function gmailModify(
  accessToken: string,
  gmailMessageId: string,
  removeLabels: string[]
): Promise<void> {
  const body: Record<string, string[]> = {
    addLabelIds: ["INBOX", "UNREAD"],
    removeLabelIds: removeLabels,
  };

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gmail modify failed (${res.status}): ${detail}`);
  }
}

/**
 * Resolve Gmail label names (e.g. "newsletters") to label IDs needed by the modify API.
 */
async function resolveLabelIds(
  accessToken: string,
  labelNames: string[]
): Promise<string[]> {
  if (labelNames.length === 0) return [];

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as { labels: { id: string; name: string }[] };
  const nameToId = Object.fromEntries(
    (data.labels ?? []).map((l) => [l.name.toLowerCase(), l.id])
  );

  const ids: string[] = [];
  for (const name of labelNames) {
    // Some entries (e.g. "SPAM", "IMPORTANT") are system label ids, not names.
    // If the name is already an all-caps system label, use it directly.
    if (/^[A-Z_]+$/.test(name)) {
      ids.push(name);
    } else {
      const id = nameToId[name.toLowerCase()];
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * POST /api/undo
 * Body: { processed_email_id: number }
 *
 * 1. Verify the caller is signed in (anon client + session).
 * 2. Use the service role client to fetch the row + linked account.
 * 3. Refresh the Gmail access token.
 * 4. Call Gmail messages.modify to restore INBOX/UNREAD and remove applied labels.
 * 5. Mark the row [UNDONE] in Supabase.
 */
export async function POST(request: Request) {
  // --- Step 1: verify the caller is signed in ---
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // --- Parse body ---
  let processed_email_id: number;
  try {
    const body = await request.json();
    processed_email_id = Number(body.processed_email_id);
    if (!Number.isInteger(processed_email_id) || processed_email_id <= 0) {
      throw new Error("invalid");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request: processed_email_id must be a positive integer" },
      { status: 400 }
    );
  }

  // --- Step 2: fetch the row via service role (bypasses RLS for lookup; we already verified auth) ---
  const svc = createServiceClient();

  const { data: peRows, error: peError } = await svc
    .from("processed_emails")
    .select("id, gmail_message_id, account_id, user_id, actions_taken, was_archived, applied_label_names")
    .eq("id", processed_email_id)
    .eq("user_id", user.id)  // extra safety: only allow undo of own rows
    .limit(1);

  if (peError || !peRows || peRows.length === 0) {
    return NextResponse.json(
      { error: "Processed email not found or not owned by current user" },
      { status: 404 }
    );
  }

  const pe = peRows[0];

  if ((pe.actions_taken ?? "").includes("[UNDONE]")) {
    return NextResponse.json(
      { error: "This email has already been undone" },
      { status: 409 }
    );
  }

  // --- Fetch the linked account for token_json ---
  const { data: accRows, error: accError } = await svc
    .from("accounts")
    .select("token_json")
    .eq("id", pe.account_id)
    .limit(1);

  if (accError || !accRows || accRows.length === 0) {
    return NextResponse.json(
      { error: "Linked Gmail account not found" },
      { status: 404 }
    );
  }

  let tokenJson: TokenJson;
  try {
    tokenJson = JSON.parse(accRows[0].token_json) as TokenJson;
    if (!tokenJson.refresh_token || !tokenJson.token_uri) throw new Error();
  } catch {
    return NextResponse.json(
      { error: "Stored Gmail credentials are malformed" },
      { status: 500 }
    );
  }

  // --- Step 3: refresh the access token ---
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(tokenJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Could not refresh Gmail access token: ${msg}` },
      { status: 502 }
    );
  }

  // --- Step 4: resolve label names → IDs and call Gmail modify ---
  const gmailMsgId: string = pe.gmail_message_id;
  let appliedLabelNames: string[] = [];
  try {
    const raw = pe.applied_label_names;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        appliedLabelNames = parsed.map(String);
      }
    }
  } catch {
    // ignore malformed JSON — proceed with no label removal
  }

  let removeIds: string[] = [];
  try {
    removeIds = await resolveLabelIds(accessToken, appliedLabelNames);
  } catch {
    // non-fatal — still restore INBOX/UNREAD even if label resolution fails
  }

  try {
    await gmailModify(accessToken, gmailMsgId, removeIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gmail modify failed: ${msg}` },
      { status: 502 }
    );
  }

  // --- Step 5: mark [UNDONE] in Supabase ---
  const prevActions = (pe.actions_taken ?? "").trim();
  const newActions = prevActions ? `${prevActions} [UNDONE]` : "[UNDONE]";

  const { error: updateError } = await svc
    .from("processed_emails")
    .update({ actions_taken: newActions })
    .eq("id", processed_email_id);

  if (updateError) {
    console.error("Failed to mark row as undone:", updateError);
    // Gmail was already modified — log but still report success to the user
  }

  return NextResponse.json({ ok: true });
}
