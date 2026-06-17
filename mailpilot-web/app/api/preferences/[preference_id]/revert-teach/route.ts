import { buildReasonJson, teachRevertSummary } from "@/lib/actionLog";
import { getCurrentUser } from "@/lib/auth/session";
import { blockIfDemoMode, isDemoRequest } from "@/lib/demo";
import { PREFERENCE_SELECT, type MailPreferenceRow } from "@/lib/preferences";
import {
  fetchRowsForTeachRevert,
  revertTeachBackfillRows,
} from "@/lib/teachBackfill";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

function parsePreferenceId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * POST /api/preferences/:preference_id/revert-teach
 * Disables the preference and restores rows backfilled by that teach.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ preference_id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      restored_count: 3,
      message: "Demo teach revert simulated",
    });
  }

  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const { preference_id: idParam } = await context.params;
  const preferenceId = parsePreferenceId(idParam);
  if (preferenceId === null) {
    return NextResponse.json({ error: "Invalid preference id" }, { status: 400 });
  }

  let preference: MailPreferenceRow & {
    accounts?: { email: string } | { email: string }[];
  };
  try {
    const rows = await fluxJson<(MailPreferenceRow & { accounts?: { email: string } | { email: string }[] })[]>(
      `/mail_preferences${postgrestParams([
        ["select", `${PREFERENCE_SELECT},accounts(email)`],
        ["id", `eq.${preferenceId}`],
        ["user_id", `eq.${user.id}`],
      ])}`
    );
    preference = rows[0];
    if (!preference) {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }
  } catch (err) {
    console.error("revert-teach preference fetch:", err);
    return NextResponse.json({ error: "Failed to load preference" }, { status: 500 });
  }

  const accountEmail = Array.isArray(preference.accounts)
    ? preference.accounts[0]?.email ?? null
    : preference.accounts?.email ?? null;

  let backfillRows: Awaited<ReturnType<typeof fetchRowsForTeachRevert>> = [];
  try {
    backfillRows = await fetchRowsForTeachRevert(user.id, preferenceId);
  } catch (err) {
    console.error("revert-teach rows fetch:", err);
    return NextResponse.json({ error: "Failed to load backfilled rows" }, { status: 500 });
  }

  const now = new Date().toISOString();
  try {
    await fluxJson(
      `/mail_preferences${postgrestParams([
        ["id", `eq.${preferenceId}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      {
        method: "PATCH",
        json: { enabled: false, updated_at: now },
      }
    );
  } catch (err) {
    console.error("revert-teach disable preference:", err);
    return NextResponse.json({ error: "Failed to disable preference" }, { status: 500 });
  }

  let restoredCount = 0;
  try {
    restoredCount = await revertTeachBackfillRows(backfillRows);
  } catch (err) {
    console.error("revert-teach restore rows:", err);
    return NextResponse.json(
      { error: "Preference disabled but row restore failed", preference_id: preferenceId },
      { status: 500 }
    );
  }

  const summary = teachRevertSummary(accountEmail, restoredCount);

  try {
    await fluxJson("/mail_action_log", {
      method: "POST",
      json: [
        {
          user_id: user.id,
          account_id: preference.account_id,
          processed_email_id: null,
          gmail_message_id: `preference-${preferenceId}`,
          gmail_thread_id: null,
          category_id: preference.category_id,
          preference_id: preferenceId,
          action_taken: "teach_revert",
          reason_json: {
            ...buildReasonJson({
              account_email: accountEmail,
              category_slug:
                preference.match_conditions_json.category_slug ?? "unknown",
              matched_preference_id: preferenceId,
              policy_applied: preference.action_policy,
              hard_stop_checked: false,
              summary,
            }),
            restored_count: restoredCount,
          },
          previous_state_json: {
            preference_enabled: preference.enabled,
            backfill_row_count: backfillRows.length,
          },
        },
      ],
    });
  } catch (err) {
    console.error("revert-teach action log:", err);
    return NextResponse.json(
      {
        error: "Revert applied but audit log failed",
        restored_count: restoredCount,
        preference_id: preferenceId,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    restored_count: restoredCount,
    summary,
  });
}
