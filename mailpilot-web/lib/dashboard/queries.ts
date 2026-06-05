import type { RunJobRow } from "@/app/api/run/route";
import type { ProcessedEmailRow } from "@/app/dashboard/HistoryTable";
import { CATEGORY_ORDER } from "@/lib/categories";
import { fluxCount, fluxJson, postgrestParams } from "@/lib/flux/client";

export interface ConnectedAccount {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
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
  const rows = await fluxJson<ConnectedAccount[]>(
    `/accounts${postgrestParams([
      ["select", "id,email,display_name,active,processing_enabled"],
      userFilter(userId),
      ["active", "eq.true"],
      ["order", "email.asc"],
    ])}`
  );
  return rows.map((row) => ({
    ...row,
    processing_enabled: row.processing_enabled !== false,
  }));
}

export async function getEmailHistory(
  userId: string
): Promise<ProcessedEmailRow[]> {
  return await fluxJson<ProcessedEmailRow[]>(
    `/processed_emails${postgrestParams([
      [
        "select",
        "id,gmail_message_id,account_id,accounts(email),category,subject,sender,processed_at,message_received_at,actions_taken,was_archived,applied_label_names",
      ],
      userFilter(userId),
      ["order", "message_received_at.desc.nullslast"],
      ["order", "processed_at.desc"],
      ["order", "id.asc"],
      ["limit", 50],
    ])}`
  );
}

export async function getLatestJob(userId: string): Promise<RunJobRow | null> {
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
