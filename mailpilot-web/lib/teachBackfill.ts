import type { CategoryActionPolicy } from "@/lib/categoryPolicy";
import { fluxCount, fluxJson, postgrestParams } from "@/lib/flux/client";
import type { CompositeMatchConditions } from "@/lib/preferenceGuard";
import {
  preferenceMatchesMessage,
  type PreferenceMatchInput,
} from "@/lib/preferenceMatcher";

export const TEACH_BACKFILL_SCAN_LIMIT = 500;

export interface TeachBackfillScanMeta {
  match_count: number;
  scanned_count: number;
  scan_limit: number;
  truncated: boolean;
  total_candidate_count?: number;
}

export interface TeachBackfillEmailRow {
  id: number;
  account_id: number;
  category: string;
  subject: string | null;
  sender: string | null;
  resolution_status: string | null;
  proposed_action: string | null;
  inbox_status: string | null;
  was_archived: boolean;
  actions_taken: string | null;
  taught_preference_id: number | null;
  taught_revert_state?: TeachRevertState | null;
}

export interface TeachRevertState {
  resolution_status: string;
  proposed_action: string | null;
  inbox_status: string;
  was_archived: boolean;
  actions_taken: string | null;
}

const BACKFILL_SELECT =
  "id,account_id,category,subject,sender,resolution_status,proposed_action,inbox_status,was_archived,actions_taken,taught_preference_id,taught_revert_state";

export function buildTeachScanMeta(input: {
  matchCount: number;
  scannedCount: number;
  totalCandidateCount?: number | null;
}): TeachBackfillScanMeta {
  const scan_limit = TEACH_BACKFILL_SCAN_LIMIT;
  const scanned_count = input.scannedCount;
  let truncated = false;
  if (input.totalCandidateCount != null) {
    truncated = input.totalCandidateCount > scan_limit;
  } else {
    truncated = scanned_count >= scan_limit;
  }
  const meta: TeachBackfillScanMeta = {
    match_count: input.matchCount,
    scanned_count,
    scan_limit,
    truncated,
  };
  if (input.totalCandidateCount != null) {
    meta.total_candidate_count = input.totalCandidateCount;
  }
  return meta;
}

export function teachConfirmBodyCopy(meta: TeachBackfillScanMeta): string {
  if (meta.truncated) {
    return `MailPilot scanned the first ${meta.scanned_count} candidate messages (limit ${meta.scan_limit}) and found ${meta.match_count} matches. More older matching messages may exist.`;
  }
  return `This will mark ${meta.match_count} similar message${meta.match_count === 1 ? "" : "s"} in this mailbox.`;
}

export function categoryPrefilter(conditions: CompositeMatchConditions): string | null {
  return conditions.category_slug ?? null;
}

function candidateFilters(
  userId: string,
  accountId: number,
  categorySlug: string | null
): Array<[string, string]> {
  const filters: Array<[string, string]> = [
    ["user_id", `eq.${userId}`],
    ["account_id", `eq.${accountId}`],
  ];
  if (categorySlug) {
    filters.push(["category", `eq.${categorySlug}`]);
  }
  return filters;
}

export async function countTeachCandidatePool(
  userId: string,
  accountId: number,
  conditions: CompositeMatchConditions
): Promise<number | null> {
  const categorySlug = categoryPrefilter(conditions);
  return fluxCount(
    `/processed_emails${postgrestParams([
      ["select", "id"],
      ...candidateFilters(userId, accountId, categorySlug),
    ])}`
  );
}

function shouldSkipBackfillRow(
  row: TeachBackfillEmailRow,
  preferenceId: number | null,
  actionPolicy: CategoryActionPolicy
): boolean {
  if (
    row.taught_preference_id != null &&
    preferenceId != null &&
    row.taught_preference_id !== preferenceId
  ) {
    return true;
  }
  if (actionPolicy === "archive" && row.was_archived) {
    return true;
  }
  return false;
}

export function filterTeachBackfillMatches(
  scanned: TeachBackfillEmailRow[],
  preference: PreferenceMatchInput,
  actionPolicy: CategoryActionPolicy,
  options: { preferenceId?: number | null; includeIds?: Set<number> } = {}
): TeachBackfillEmailRow[] {
  const includeIds = options.includeIds ?? new Set<number>();
  return scanned.filter((row) => {
    if (includeIds.has(row.id)) return true;
    if (shouldSkipBackfillRow(row, options.preferenceId ?? null, actionPolicy)) {
      return false;
    }
    return preferenceMatchesMessage(preference, row);
  });
}

export async function scanTeachBackfillCandidates(input: {
  userId: string;
  accountId: number;
  preference: PreferenceMatchInput;
  actionPolicy: CategoryActionPolicy;
  sourceProcessedEmailId: number;
  preferenceId?: number | null;
}): Promise<{ matches: TeachBackfillEmailRow[]; scan: TeachBackfillScanMeta }> {
  const categorySlug = categoryPrefilter(input.preference.match_conditions_json);
  const filters = candidateFilters(input.userId, input.accountId, categorySlug);

  const [totalCandidateCount, scanned] = await Promise.all([
    countTeachCandidatePool(input.userId, input.accountId, input.preference.match_conditions_json),
    fluxJson<TeachBackfillEmailRow[]>(
      `/processed_emails${postgrestParams([
        ["select", BACKFILL_SELECT],
        ...filters,
        ["order", "message_received_at.desc.nullslast"],
        ["order", "id.asc"],
        ["limit", TEACH_BACKFILL_SCAN_LIMIT],
      ])}`
    ),
  ]);

  const includeIds = new Set([input.sourceProcessedEmailId]);
  const matches = filterTeachBackfillMatches(
    scanned,
    input.preference,
    input.actionPolicy,
    { preferenceId: input.preferenceId ?? null, includeIds }
  );

  // Ensure source row is included even if outside scanned window (edge case).
  if (!matches.some((row) => row.id === input.sourceProcessedEmailId)) {
    try {
      const sourceRows = await fluxJson<TeachBackfillEmailRow[]>(
        `/processed_emails${postgrestParams([
          ["select", BACKFILL_SELECT],
          ["id", `eq.${input.sourceProcessedEmailId}`],
          ["user_id", `eq.${input.userId}`],
        ])}`
      );
      const source = sourceRows[0];
      if (source && !shouldSkipBackfillRow(source, input.preferenceId ?? null, input.actionPolicy)) {
        matches.unshift(source);
      }
    } catch {
      // Source fetch failure is non-fatal; teach route already validated ownership.
    }
  }

  const uniqueMatches = [...new Map(matches.map((row) => [row.id, row])).values()];
  const scan = buildTeachScanMeta({
    matchCount: uniqueMatches.length,
    scannedCount: scanned.length,
    totalCandidateCount,
  });

  return { matches: uniqueMatches, scan };
}

export function snapshotForRevert(row: TeachBackfillEmailRow): TeachRevertState {
  return {
    resolution_status: row.resolution_status ?? "unresolved",
    proposed_action: row.proposed_action ?? null,
    inbox_status: row.inbox_status ?? "unknown",
    was_archived: row.was_archived,
    actions_taken: row.actions_taken,
  };
}

export function backfillPatchForPolicy(
  actionPolicy: "archive" | "never_archive",
  preferenceId: number,
  revertState: TeachRevertState
): Record<string, unknown> {
  return {
    taught_preference_id: preferenceId,
    taught_revert_state: revertState,
    resolution_status: "kept",
    proposed_action: actionPolicy,
  };
}

export async function applyTeachBackfillRows(
  rows: TeachBackfillEmailRow[],
  preferenceId: number,
  actionPolicy: "archive" | "never_archive"
): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const revertState = snapshotForRevert(row);
    await fluxJson(
      `/processed_emails${postgrestParams([
        ["id", `eq.${row.id}`],
      ])}`,
      {
        method: "PATCH",
        json: backfillPatchForPolicy(actionPolicy, preferenceId, revertState),
      }
    );
    updated += 1;
  }
  return updated;
}

export async function fetchRowsForTeachRevert(
  userId: string,
  preferenceId: number
): Promise<TeachBackfillEmailRow[]> {
  return fluxJson<TeachBackfillEmailRow[]>(
    `/processed_emails${postgrestParams([
      ["select", BACKFILL_SELECT],
      ["user_id", `eq.${userId}`],
      ["taught_preference_id", `eq.${preferenceId}`],
    ])}`
  );
}

export async function revertTeachBackfillRows(
  rows: Array<TeachBackfillEmailRow & { taught_revert_state?: TeachRevertState | null }>
): Promise<number> {
  let restored = 0;
  for (const row of rows) {
    const snapshot = row.taught_revert_state;
    if (!snapshot) continue;
    await fluxJson(
      `/processed_emails${postgrestParams([["id", `eq.${row.id}`]])}`,
      {
        method: "PATCH",
        json: {
          taught_preference_id: null,
          taught_revert_state: null,
          resolution_status: snapshot.resolution_status,
          proposed_action: snapshot.proposed_action,
          inbox_status: snapshot.inbox_status,
          was_archived: snapshot.was_archived,
          actions_taken: snapshot.actions_taken,
        },
      }
    );
    restored += 1;
  }
  return restored;
}

export function teachScanReasonFields(
  scan: TeachBackfillScanMeta,
  backfillCount: number,
  backfillIds: number[]
): Record<string, unknown> {
  return {
    backfill_count: backfillCount,
    backfill_processed_email_ids: backfillIds,
    apply_backfill: true,
    scanned_count: scan.scanned_count,
    scan_limit: scan.scan_limit,
    truncated: scan.truncated,
    ...(scan.total_candidate_count != null
      ? { total_candidate_count: scan.total_candidate_count }
      : {}),
  };
}
