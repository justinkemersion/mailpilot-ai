import { getCurrentUser } from "@/lib/auth/session";
import { normalizeCleanupAction, safetyTierForCategory } from "@/lib/cleanup";
import { blockIfDemoMode, isDemoRequest } from "@/lib/demo";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { google } from "googleapis";
import { NextResponse } from "next/server";

const MAX_BULK_ACTION = 50;

interface StoredTokenJson {
  refresh_token?: string;
  [key: string]: unknown;
}

interface CleanupEmailJoined {
  id: number;
  user_id: string;
  account_id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  category: string;
  category_id: number | null;
  subject: string | null;
  sender: string | null;
  actions_taken: string | null;
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

interface ActionLogInsert {
  user_id: string;
  account_id: number;
  processed_email_id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  category_id: number | null;
  preference_id: null;
  action_taken: "cleanup_archive" | "cleanup_keep";
  reason_json: Record<string, unknown>;
  previous_state_json: Record<string, unknown>;
}

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_BULK_ACTION);
}

function appendCleanupAction(previous: string | null, action: "archive" | "keep"): string {
  const text = action === "archive" ? "Cleanup: archived" : "Cleanup: kept";
  const trimmed = (previous ?? "").trim();
  return trimmed ? `${trimmed}; ${text}` : text;
}

function accountFor(row: CleanupEmailJoined) {
  return Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
}

async function archiveInGmail(row: CleanupEmailJoined): Promise<void> {
  const account = accountFor(row);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
  }
  if (!account?.token_json) {
    throw new Error("Missing account credentials");
  }

  let stored: StoredTokenJson;
  try {
    stored = JSON.parse(account.token_json) as StoredTokenJson;
  } catch {
    throw new Error("Stored Gmail credentials are malformed");
  }

  if (!stored.refresh_token) {
    throw new Error("No refresh token stored for this account; reconnect Gmail.");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: stored.refresh_token });
  await oauth2.getAccessToken();

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  await gmail.users.messages.modify({
    userId: "me",
    id: row.gmail_message_id,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
}

function buildActionLog(
  userId: string,
  row: CleanupEmailJoined,
  action: "archive" | "keep"
): ActionLogInsert {
  const account = accountFor(row);
  const tier = safetyTierForCategory(row.category);
  const policy = action === "archive" ? "archive" : "keep_inbox";
  return {
    user_id: userId,
    account_id: row.account_id,
    processed_email_id: row.id,
    gmail_message_id: row.gmail_message_id,
    gmail_thread_id: row.gmail_thread_id,
    category_id: row.category_id,
    preference_id: null,
    action_taken: action === "archive" ? "cleanup_archive" : "cleanup_keep",
    reason_json: {
      account_email: account?.email ?? null,
      account_purpose: account?.purpose ?? "other",
      category_slug: row.category,
      matched_preference_id: null,
      policy_applied: policy,
      safety_tier: tier,
      confidence: null,
      hard_stop_checked: false,
      summary:
        action === "archive"
          ? "Archived manually from Cleanup."
          : "Kept in inbox manually from Cleanup.",
    },
    previous_state_json: {
      resolution_status: row.resolution_status ?? "unresolved",
      inbox_status: row.inbox_status ?? "unknown",
      was_archived: row.was_archived,
      actions_taken: row.actions_taken,
      proposed_action: row.proposed_action,
      subject: row.subject,
      sender: row.sender,
    },
  };
}

async function updateProcessedEmail(
  userId: string,
  row: CleanupEmailJoined,
  action: "archive" | "keep"
): Promise<void> {
  await fluxJson(
    `/processed_emails${postgrestParams([
      ["select", "id"],
      ["id", `eq.${row.id}`],
      ["user_id", `eq.${userId}`],
    ])}`,
    {
      method: "PATCH",
      json: {
        resolution_status: action === "archive" ? "archived" : "kept",
        inbox_status: action === "archive" ? "archived" : "in_inbox",
        was_archived: action === "archive" ? true : row.was_archived,
        actions_taken: appendCleanupAction(row.actions_taken, action),
      },
    }
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      processed: 0,
      message: "Demo action simulated",
    });
  }

  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  let ids: number[];
  let action: "archive" | "keep" | null;
  try {
    const body = await request.json();
    ids = parseIds(body.processed_email_ids);
    action = normalizeCleanupAction(body.action);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!action) {
    return NextResponse.json({ error: "action must be archive or keep" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "processed_email_ids must include at least one positive integer" },
      { status: 400 }
    );
  }

  let rows: CleanupEmailJoined[];
  try {
    rows = await fluxJson<CleanupEmailJoined[]>(
      `/processed_emails${postgrestParams([
        [
          "select",
          "id,user_id,account_id,gmail_message_id,gmail_thread_id,category,category_id,subject,sender,actions_taken,was_archived,resolution_status,inbox_status,proposed_action,accounts!inner(token_json,user_id,email,purpose)",
        ],
        ["id", `in.(${ids.join(",")})`],
        ["user_id", `eq.${user.id}`],
        ["resolution_status", "eq.unresolved"],
      ])}`
    );
  } catch (err) {
    console.error("cleanup actions fetch:", err);
    return NextResponse.json({ error: "Failed to fetch cleanup messages" }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No unresolved cleanup messages found for this user" },
      { status: 404 }
    );
  }

  const processed: number[] = [];
  const errors: Array<{ id: number; error: string }> = [];

  for (const row of rows) {
    const account = accountFor(row);
    if (!account || account.user_id !== user.id || row.user_id !== user.id) {
      errors.push({ id: row.id, error: "Forbidden" });
      continue;
    }

    try {
      if (action === "archive") {
        await archiveInGmail(row);
      }
      await fluxJson("/mail_action_log", {
        method: "POST",
        json: [buildActionLog(user.id, row, action)],
      });
      await updateProcessedEmail(user.id, row, action);
      processed.push(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("cleanup action failed:", row.id, message);
      errors.push({ id: row.id, error: message });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    action,
    processed,
    failed: errors,
    skipped: ids.filter((id) => !rows.some((row) => row.id === id)),
  });
}
