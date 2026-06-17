import type { RunJobRow } from "@/app/api/run/route";
import {
  EMAIL_ACTIVITY_PAGE_SIZE,
  EMAIL_ACTIVITY_SELECT,
  OVERVIEW_ACTIVITY_PREVIEW_LIMIT,
  type ProcessedEmailRow,
} from "@/lib/emailActivity";
import { groupCleanupCandidates, type CleanupGroup } from "@/lib/cleanup";
import { CATEGORY_ORDER } from "@/lib/categories";
import {
  getDemoConnectedAccounts,
  getDemoDashboardMetrics,
  getDemoEmailActivityPage,
  getDemoLastSyncedByAccount,
  getDemoLatestJob,
  getDemoCleanupGroups,
  getDemoSyncRunHistory,
  isDemoRequest,
} from "@/lib/demo";
import { fluxCount, fluxJson, postgrestParams } from "@/lib/flux/client";
import type { AccountPurpose, DefaultArchivePolicy, SecurityPosture } from "@/lib/accountScope";

export type { ProcessedEmailRow };

export interface EmailActivityPage {
  rows: ProcessedEmailRow[];
  total: number;
  offset: number;
  limit: number;
}

export interface ConnectedAccount {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
  purpose: AccountPurpose;
  default_archive_policy: DefaultArchivePolicy;
  security_posture: SecurityPosture;
  scope_configured_at: string | null;
}

export interface DashboardMetrics {
  total_processed: number | null;
  total_archived: number | null;
  total_labeled: number | null;
  active_accounts: number | null;
  by_category: Record<string, number>;
}

function userFilter(userId: string): [string, string] {
  return ["user_id", `eq.${userId}`];
}

async function countProcessedEmails(
  userId: string,
  extra: Array<[string, string]> = []
): Promise<number | null> {
  return fluxCount(
    `/processed_emails${postgrestParams([["select", "id"], userFilter(userId), ...extra])}`
  );
}

export async function getDashboardMetrics(
  userId: string
): Promise<DashboardMetrics> {
  if (await isDemoRequest()) return getDemoDashboardMetrics();
  const [total_processed, total_archived, total_labeled, accounts, ...categoryCounts] =
    await Promise.all([
      countProcessedEmails(userId),
      countProcessedEmails(userId, [["was_archived", "eq.true"]]),
      countProcessedEmails(userId, [
        ["applied_label_names", "not.is.null"],
        ["applied_label_names", "neq.[]"],
      ]),
      getConnectedAccounts(userId),
      ...CATEGORY_ORDER.map((category) =>
        countProcessedEmails(userId, [["category", `eq.${category}`]])
      ),
    ]);

  const by_category: Record<string, number> = {};
  CATEGORY_ORDER.forEach((category, index) => {
    const count = categoryCounts[index];
    if (count != null && count > 0) {
      by_category[category] = count;
    }
  });

  const active_accounts = accounts.filter((a) => a.processing_enabled).length;

  return {
    total_processed,
    total_archived,
    total_labeled,
    active_accounts,
    by_category,
  };
}

export async function getLastSyncedByAccount(
  userId: string
): Promise<Record<number, string>> {
  if (await isDemoRequest()) return getDemoLastSyncedByAccount();
  const rows = await fluxJson<Array<{ account_id: number; processed_at: string }>>(
    `/processed_emails${postgrestParams([
      ["select", "account_id,processed_at"],
      userFilter(userId),
      ["order", "processed_at.desc"],
      ["limit", 300],
    ])}`
  );

  const map: Record<number, string> = {};
  for (const row of rows) {
    if (map[row.account_id] == null) {
      map[row.account_id] = row.processed_at;
    }
  }
  return map;
}

export async function getConnectedAccounts(
  userId: string
): Promise<ConnectedAccount[]> {
  if (await isDemoRequest()) return getDemoConnectedAccounts();
  const rows = await fluxJson<ConnectedAccount[]>(
    `/accounts${postgrestParams([
      [
        "select",
        "id,email,display_name,active,processing_enabled,purpose,default_archive_policy,security_posture,scope_configured_at",
      ],
      userFilter(userId),
      ["active", "eq.true"],
      ["order", "email.asc"],
    ])}`
  );
  return rows.map((row) => ({
    ...row,
    processing_enabled: row.processing_enabled !== false,
    purpose: row.purpose ?? "other",
    default_archive_policy: row.default_archive_policy ?? "ask_first",
    security_posture: row.security_posture ?? "standard",
  }));
}

export async function getEmailActivityPage(
  userId: string,
  options: {
    offset?: number;
    limit?: number;
    category?: string | null;
  } = {}
): Promise<EmailActivityPage> {
  if (await isDemoRequest()) return getDemoEmailActivityPage(options);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? EMAIL_ACTIVITY_PAGE_SIZE));
  const filters: Array<[string, string]> = [userFilter(userId)];
  if (options.category) {
    filters.push(["category", `eq.${options.category}`]);
  }

  const [rows, total] = await Promise.all([
    fluxJson<ProcessedEmailRow[]>(
      `/processed_emails${postgrestParams([
        ["select", EMAIL_ACTIVITY_SELECT],
        ...filters,
        ["order", "message_received_at.desc.nullslast"],
        ["order", "processed_at.desc"],
        ["order", "id.asc"],
        ["limit", limit],
        ["offset", offset],
      ])}`
    ),
    countProcessedEmails(userId, options.category ? [["category", `eq.${options.category}`]] : []),
  ]);

  return { rows, total: total ?? rows.length, offset, limit };
}

export async function getEmailHistory(
  userId: string
): Promise<ProcessedEmailRow[]> {
  const page = await getEmailActivityPage(userId, {
    offset: 0,
    limit: EMAIL_ACTIVITY_PAGE_SIZE,
  });
  return page.rows;
}

export async function getEmailHistoryPreview(
  userId: string
): Promise<ProcessedEmailRow[]> {
  const page = await getEmailActivityPage(userId, {
    offset: 0,
    limit: OVERVIEW_ACTIVITY_PREVIEW_LIMIT,
  });
  return page.rows;
}

export async function getCleanupCandidateRows(
  userId: string,
  limit = 200
): Promise<ProcessedEmailRow[]> {
  if (await isDemoRequest()) {
    return getDemoCleanupGroups().flatMap((group) => group.candidates);
  }

  return fluxJson<ProcessedEmailRow[]>(
    `/processed_emails${postgrestParams([
      ["select", EMAIL_ACTIVITY_SELECT],
      userFilter(userId),
      ["resolution_status", "eq.unresolved"],
      ["was_archived", "eq.false"],
      ["order", "message_received_at.desc.nullslast"],
      ["order", "processed_at.desc"],
      ["limit", Math.min(Math.max(1, limit), 500)],
    ])}`
  );
}

export async function getCleanupGroups(userId: string): Promise<CleanupGroup[]> {
  if (await isDemoRequest()) return getDemoCleanupGroups();
  const rows = await getCleanupCandidateRows(userId);
  return groupCleanupCandidates(rows);
}

export async function getLatestJob(userId: string): Promise<RunJobRow | null> {
  if (await isDemoRequest()) return getDemoLatestJob();
  const rows = await fluxJson<RunJobRow[]>(
    `/run_jobs${postgrestParams([
      [
        "select",
        "id,status,options,result,error,progress,created_at,started_at,completed_at",
      ],
      userFilter(userId),
      ["order", "created_at.desc"],
      ["limit", 1],
    ])}`
  );
  return rows[0] ?? null;
}

export async function getSyncRunHistory(userId: string): Promise<RunJobRow[]> {
  if (await isDemoRequest()) return getDemoSyncRunHistory();
  return fluxJson<RunJobRow[]>(
    `/run_jobs${postgrestParams([
      [
        "select",
        "id,status,options,result,error,progress,created_at,started_at,completed_at",
      ],
      userFilter(userId),
      ["order", "created_at.desc"],
      ["limit", 5],
    ])}`
  );
}
