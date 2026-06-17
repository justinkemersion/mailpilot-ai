import { buildReasonJson, teachSummary } from "@/lib/actionLog";
import { getCurrentUser } from "@/lib/auth/session";
import { blockIfDemoMode, isDemoRequest } from "@/lib/demo";
import {
  buildTeachCompositeMatch,
  isCategoryActionPolicy,
  validatePreferenceWrite,
} from "@/lib/preferenceGuard";
import { PREFERENCE_SELECT, type MailPreferenceRow } from "@/lib/preferences";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

interface TeachEmailRow {
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
    | { email: string; purpose: string | null }
    | { email: string; purpose: string | null }[];
}

function parseProcessedEmailId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function accountFor(row: TeachEmailRow) {
  return Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
}

/**
 * POST /api/messages/:processed_email_id/teach
 * Body: { action_policy: "archive" | "never_archive" }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ processed_email_id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Demo teach simulated",
    });
  }

  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const { processed_email_id: idParam } = await context.params;
  const processedEmailId = parseProcessedEmailId(idParam);
  if (processedEmailId === null) {
    return NextResponse.json({ error: "Invalid processed email id" }, { status: 400 });
  }

  let actionPolicy: "archive" | "never_archive";
  try {
    const body = (await request.json()) as { action_policy?: unknown };
    if (body.action_policy === "archive" || body.action_policy === "never_archive") {
      actionPolicy = body.action_policy;
    } else if (isCategoryActionPolicy(body.action_policy) && body.action_policy === "keep_inbox") {
      return NextResponse.json(
        { error: "Use never_archive or archive for teach actions" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "action_policy must be archive or never_archive" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let row: TeachEmailRow;
  try {
    const rows = await fluxJson<TeachEmailRow[]>(
      `/processed_emails${postgrestParams([
        [
          "select",
          "id,user_id,account_id,gmail_message_id,gmail_thread_id,category,category_id,subject,sender,actions_taken,was_archived,resolution_status,inbox_status,proposed_action,accounts!inner(email,purpose)",
        ],
        ["id", `eq.${processedEmailId}`],
        ["user_id", `eq.${user.id}`],
      ])}`
    );
    row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
  } catch (err) {
    console.error("teach fetch:", err);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }

  const account = accountFor(row);
  const teachMatch = buildTeachCompositeMatch({
    category: row.category,
    subject: row.subject,
    sender: row.sender,
  });

  const validation = validatePreferenceWrite({
    account_id: row.account_id,
    match_type: teachMatch.match_type,
    match_conditions_json: teachMatch.match_conditions_json,
    action_policy: actionPolicy,
    category_id: row.category_id,
    category_slug: row.category,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  let preference: MailPreferenceRow;
  try {
    const created = await fluxJson<MailPreferenceRow[]>(
      `/mail_preferences${postgrestParams([["select", PREFERENCE_SELECT]])}`,
      {
        method: "POST",
        json: [
          {
            user_id: user.id,
            account_id: row.account_id,
            match_type: teachMatch.match_type,
            match_conditions_json: teachMatch.match_conditions_json,
            category_id: row.category_id,
            action_policy: actionPolicy,
            confidence_threshold: 0,
            source: "user",
            enabled: true,
            created_at: now,
            updated_at: now,
          },
        ],
      }
    );
    preference = created[0];
    if (!preference) {
      return NextResponse.json({ error: "Failed to create preference" }, { status: 500 });
    }
  } catch (err) {
    console.error("teach preference create:", err);
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }

  try {
    await fluxJson("/mail_action_log", {
      method: "POST",
      json: [
        {
          user_id: user.id,
          account_id: row.account_id,
          processed_email_id: row.id,
          gmail_message_id: row.gmail_message_id,
          gmail_thread_id: row.gmail_thread_id,
          category_id: row.category_id,
          preference_id: preference.id,
          action_taken: "teach",
          reason_json: buildReasonJson({
            account_email: account?.email ?? null,
            account_purpose: account?.purpose ?? "other",
            category_slug: row.category,
            matched_preference_id: preference.id,
            policy_applied: actionPolicy,
            hard_stop_checked: false,
            summary: teachSummary(
              actionPolicy,
              account?.email ?? null,
              teachMatch.match_conditions_json
            ),
          }),
          previous_state_json: {
            resolution_status: row.resolution_status ?? "unresolved",
            inbox_status: row.inbox_status ?? "unknown",
            was_archived: row.was_archived,
            actions_taken: row.actions_taken,
            proposed_action: row.proposed_action,
            subject: row.subject,
            sender: row.sender,
          },
        },
      ],
    });
  } catch (err) {
    console.error("teach action log:", err);
    return NextResponse.json(
      { error: "Preference saved but audit log failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    preference,
    summary: teachSummary(
      actionPolicy,
      account?.email ?? null,
      teachMatch.match_conditions_json
    ),
  });
}
