import { buildReasonJson } from "@/lib/actionLog";
import { getCurrentUser } from "@/lib/auth/session";
import { blockIfDemoMode, isDemoRequest } from "@/lib/demo";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { google } from "googleapis";
import { NextResponse } from "next/server";

interface StoredTokenJson {
  refresh_token?: string;
  [key: string]: unknown;
}

interface ProcessedEmailJoined {
  id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  account_id: number;
  user_id: string;
  category: string;
  category_id: number | null;
  subject: string | null;
  sender: string | null;
  actions_taken: string | null;
  applied_label_names: string | null;
  was_archived: boolean;
  resolution_status: string | null;
  inbox_status: string | null;
  proposed_action: string | null;
  accounts:
    | {
        token_json: string;
        user_id: string;
        email: string;
        purpose: string | null;
      }
    | {
        token_json: string;
        user_id: string;
        email: string;
        purpose: string | null;
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
  oauth2: InstanceType<typeof google.auth.OAuth2>,
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Demo action simulated",
    });
  }

  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

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

  let rows: ProcessedEmailJoined[];
  try {
    rows = await fluxJson<ProcessedEmailJoined[]>(
      `/processed_emails${postgrestParams([
        [
          "select",
          "id,gmail_message_id,gmail_thread_id,account_id,user_id,category,category_id,subject,sender,actions_taken,applied_label_names,was_archived,resolution_status,inbox_status,proposed_action,accounts!inner(token_json,user_id,email,purpose)",
        ],
        ["id", `eq.${processed_email_id}`],
        ["user_id", `eq.${user.id}`],
        ["limit", 1],
      ])}`
    );
  } catch (err) {
    console.error("undo fetch:", err);
    return NextResponse.json({ error: "Failed to fetch processed email" }, { status: 500 });
  }

  const pe = rows[0] ?? null;
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

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
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
  const restoredResolution =
    pe.was_archived || (pe.actions_taken ?? "").toLowerCase().includes("archived")
      ? "unresolved"
      : pe.resolution_status === "archived"
        ? "unresolved"
        : "kept";

  try {
    await fluxJson(
      `/processed_emails${postgrestParams([
        ["select", "id"],
        ["id", `eq.${processed_email_id}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      {
        method: "PATCH",
        json: {
          actions_taken: newActions,
          was_archived: false,
          resolution_status: restoredResolution,
          inbox_status: "in_inbox",
        },
      }
    );
  } catch (err) {
    console.error("Failed to mark row as undone:", err);
  }

  try {
    await fluxJson("/mail_action_log", {
      method: "POST",
      json: [
        {
          user_id: user.id,
          account_id: pe.account_id,
          processed_email_id: pe.id,
          gmail_message_id: pe.gmail_message_id,
          gmail_thread_id: pe.gmail_thread_id,
          category_id: pe.category_id,
          preference_id: null,
          action_taken: "undo_archive",
          reason_json: buildReasonJson({
            account_email: accountRow.email ?? null,
            account_purpose: accountRow.purpose ?? "other",
            category_slug: pe.category,
            policy_applied: "keep_inbox",
            summary: "Restored INBOX and removed MailPilot label changes where Gmail allowed.",
          }),
          previous_state_json: {
            resolution_status: pe.resolution_status ?? "archived",
            inbox_status: pe.inbox_status ?? "archived",
            was_archived: pe.was_archived,
            actions_taken: pe.actions_taken,
            proposed_action: pe.proposed_action,
            subject: pe.subject,
            sender: pe.sender,
          },
        },
      ],
    });
  } catch (err) {
    console.error("undo action log:", err);
  }

  return NextResponse.json({ ok: true });
}
