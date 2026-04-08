import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { NextResponse } from "next/server";

interface StoredTokenJson {
  refresh_token?: string;
  [key: string]: unknown;
}

interface ProcessedEmailJoined {
  id: number;
  gmail_message_id: string;
  account_id: number;
  user_id: string;
  actions_taken: string | null;
  applied_label_names: string | null;
  accounts:
    | {
        token_json: string;
        user_id: string;
      }
    | {
        token_json: string;
        user_id: string;
      }[];
}

function parseAppliedLabelNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Map stored label names (and system ids) to Gmail label IDs for messages.modify.
 */
async function resolveRemoveLabelIds(
  oauth2: OAuth2Client,
  labelNames: string[]
): Promise<string[]> {
  if (labelNames.length === 0) return [];

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];
  const nameToId = Object.fromEntries(
    labels
      .filter((l) => l.name && l.id)
      .map((l) => [l.name!.toLowerCase(), l.id!])
  );

  const ids: string[] = [];
  for (const name of labelNames) {
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
 * Authenticates the user, loads processed_emails joined to accounts (refresh_token),
 * refreshes access via google-auth-library (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
 * reverts Gmail changes via googleapis messages.modify, then marks the row [UNDONE].
 */
export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

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

  const svc = createServiceClient();

  const { data: row, error: fetchError } = await svc
    .from("processed_emails")
    .select(
      `
      id,
      gmail_message_id,
      account_id,
      user_id,
      actions_taken,
      applied_label_names,
      accounts!inner (
        token_json,
        user_id
      )
    `
    )
    .eq("id", processed_email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("undo fetch:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const pe = row as ProcessedEmailJoined | null;
  if (!pe) {
    return NextResponse.json(
      { error: "Processed email not found or not owned by current user" },
      { status: 404 }
    );
  }

  const accountRow = Array.isArray(pe.accounts) ? pe.accounts[0] : pe.accounts;
  if (!accountRow?.token_json) {
    return NextResponse.json(
      { error: "Processed email not found or not owned by current user" },
      { status: 404 }
    );
  }

  if (accountRow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if ((pe.actions_taken ?? "").includes("[UNDONE]")) {
    return NextResponse.json(
      { error: "This email has already been undone" },
      { status: 409 }
    );
  }

  let stored: StoredTokenJson;
  try {
    stored = JSON.parse(accountRow.token_json) as StoredTokenJson;
  } catch {
    return NextResponse.json(
      { error: "Stored Gmail credentials are malformed" },
      { status: 500 }
    );
  }

  const refreshToken = stored.refresh_token;
  if (!refreshToken) {
    return NextResponse.json(
      { error: "No refresh token stored for this account; reconnect Gmail." },
      { status: 400 }
    );
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  try {
    await oauth2.getAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Could not refresh Gmail access token: ${msg}` },
      { status: 502 }
    );
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const appliedNames = parseAppliedLabelNames(pe.applied_label_names);

  let removeLabelIds: string[] = [];
  try {
    removeLabelIds = await resolveRemoveLabelIds(oauth2, appliedNames);
  } catch {
    // still restore INBOX / UNREAD
  }

  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: pe.gmail_message_id,
      requestBody: {
        addLabelIds: ["INBOX", "UNREAD"],
        removeLabelIds: removeLabelIds,
      },
    });
  } catch (err: unknown) {
    const gErr = err as { message?: string; response?: { data?: unknown } };
    const msg = gErr.message ?? JSON.stringify(gErr.response?.data ?? err);
    return NextResponse.json(
      { error: `Gmail modify failed: ${msg}` },
      { status: 502 }
    );
  }

  const prevActions = (pe.actions_taken ?? "").trim();
  const newActions = prevActions ? `${prevActions} [UNDONE]` : "[UNDONE]";

  const { error: updateError } = await svc
    .from("processed_emails")
    .update({ actions_taken: newActions })
    .eq("id", processed_email_id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Failed to mark row as undone:", updateError);
  }

  return NextResponse.json({ ok: true });
}
