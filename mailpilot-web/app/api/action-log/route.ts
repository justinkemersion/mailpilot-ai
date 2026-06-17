import { getCurrentUser } from "@/lib/auth/session";
import {
  ACTION_LOG_PAGE_SIZE,
  ACTION_LOG_SELECT,
  type MailActionLogRow,
  type MailActionTaken,
} from "@/lib/actionLogTypes";
import { getDemoActionLogPage, isDemoRequest } from "@/lib/demo";
import { fluxCount, fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

const VALID_ACTIONS = new Set<MailActionTaken>([
  "label",
  "archive",
  "keep",
  "archive_blocked",
  "undo_archive",
  "teach",
  "cleanup_archive",
  "cleanup_keep",
]);

function parseOffset(value: string | null): number {
  const n = Number(value ?? "0");
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

function parseLimit(value: string | null): number {
  const n = Number(value ?? ACTION_LOG_PAGE_SIZE);
  if (!Number.isInteger(n) || n <= 0) return ACTION_LOG_PAGE_SIZE;
  return Math.min(n, 100);
}

/** GET /api/action-log — paginated audit trail for the signed-in user. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const offset = parseOffset(params.get("offset"));
  const limit = parseLimit(params.get("limit"));
  const actionFilter = params.get("action");
  const blockedOnly = params.get("blocked") === "1";

  if (await isDemoRequest()) {
    const page = getDemoActionLogPage({ offset, limit, actionFilter, blockedOnly });
    return NextResponse.json(page);
  }

  const filters: Array<[string, string]> = [
    ["select", `${ACTION_LOG_SELECT},accounts(email)`],
    ["user_id", `eq.${user.id}`],
    ["order", "created_at.desc"],
    ["offset", String(offset)],
    ["limit", String(limit)],
  ];

  if (blockedOnly) {
    filters.push(["action_taken", "eq.archive_blocked"]);
  } else if (actionFilter && VALID_ACTIONS.has(actionFilter as MailActionTaken)) {
    filters.push(["action_taken", `eq.${actionFilter}`]);
  }

  try {
    const [rows, total] = await Promise.all([
      fluxJson<MailActionLogRow[]>(`/mail_action_log${postgrestParams(filters)}`),
      fluxCount(
        `/mail_action_log${postgrestParams([
          ["select", "id"],
          ["user_id", `eq.${user.id}`],
          ...(blockedOnly
            ? ([["action_taken", "eq.archive_blocked"]] as Array<[string, string]>)
            : actionFilter && VALID_ACTIONS.has(actionFilter as MailActionTaken)
              ? ([["action_taken", `eq.${actionFilter}`]] as Array<[string, string]>)
              : []),
        ])}`
      ),
    ]);

    return NextResponse.json({
      rows,
      total: total ?? rows.length,
      offset,
      limit,
    });
  } catch (err) {
    console.error("action-log GET:", err);
    return NextResponse.json({ error: "Failed to load action log" }, { status: 500 });
  }
}
