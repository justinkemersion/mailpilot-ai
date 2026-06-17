import { buildReasonJson, teachSummary } from "@/lib/actionLog";
import { getCurrentUser } from "@/lib/auth/session";
import { isDemoRequest } from "@/lib/demo";
import { getDemoTeachPreview } from "@/lib/demo/fixtures";
import {
  buildTeachCompositeMatch,
  isCategoryActionPolicy,
  validatePreferenceWrite,
} from "@/lib/preferenceGuard";
import {
  scanTeachBackfillCandidates,
  teachConfirmBodyCopy,
} from "@/lib/teachBackfill";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

interface TeachEmailRow {
  id: number;
  user_id: string;
  account_id: number;
  category: string;
  category_id: number | null;
  subject: string | null;
  sender: string | null;
  accounts:
    | { email: string; purpose: string | null }
    | { email: string; purpose: string | null }[];
}

function parseProcessedEmailId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseActionPolicy(value: string | null): "archive" | "never_archive" | null {
  if (value === "archive" || value === "never_archive") return value;
  return null;
}

function accountFor(row: TeachEmailRow) {
  return Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
}

/**
 * GET /api/messages/:processed_email_id/teach/preview?action_policy=archive|never_archive
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ processed_email_id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { processed_email_id: idParam } = await context.params;
  const processedEmailId = parseProcessedEmailId(idParam);
  if (processedEmailId === null) {
    return NextResponse.json({ error: "Invalid processed email id" }, { status: 400 });
  }

  const actionPolicy = parseActionPolicy(
    new URL(request.url).searchParams.get("action_policy")
  );
  if (!actionPolicy) {
    return NextResponse.json(
      { error: "action_policy must be archive or never_archive" },
      { status: 400 }
    );
  }

  if (await isDemoRequest()) {
    return NextResponse.json(getDemoTeachPreview(processedEmailId, actionPolicy));
  }

  let row: TeachEmailRow;
  try {
    const rows = await fluxJson<TeachEmailRow[]>(
      `/processed_emails${postgrestParams([
        [
          "select",
          "id,user_id,account_id,category,category_id,subject,sender,accounts!inner(email,purpose)",
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
    console.error("teach preview fetch:", err);
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

  try {
    const { scan } = await scanTeachBackfillCandidates({
      userId: user.id,
      accountId: row.account_id,
      preference: {
        enabled: true,
        match_type: teachMatch.match_type,
        match_conditions_json: teachMatch.match_conditions_json,
      },
      actionPolicy,
      sourceProcessedEmailId: row.id,
    });

    const summary = teachSummary(
      actionPolicy,
      account?.email ?? null,
      teachMatch.match_conditions_json,
      {
        backfill_count: scan.match_count,
        truncated: scan.truncated,
        scanned_count: scan.scanned_count,
        scan_limit: scan.scan_limit,
      }
    );

    return NextResponse.json({
      match_count: scan.match_count,
      scanned_count: scan.scanned_count,
      scan_limit: scan.scan_limit,
      truncated: scan.truncated,
      ...(scan.total_candidate_count != null
        ? { total_candidate_count: scan.total_candidate_count }
        : {}),
      includes_source: true,
      account_email: account?.email ?? null,
      summary,
      confirm_body: teachConfirmBodyCopy(scan),
    });
  } catch (err) {
    console.error("teach preview scan:", err);
    return NextResponse.json({ error: "Failed to preview teach backfill" }, { status: 500 });
  }
}
