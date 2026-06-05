import { fluxJson, postgrestParams } from "@/lib/flux/client";
import type { RunJobRow } from "@/app/api/run/route";
import type { ProcessedEmailRow } from "@/app/dashboard/HistoryTable";

export interface ConnectedAccount {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
}

export async function getConnectedAccounts(
  userId: string
): Promise<ConnectedAccount[]> {
  const rows = await fluxJson<ConnectedAccount[]>(
    `/accounts${postgrestParams([
      ["select", "id,email,display_name,active,processing_enabled"],
      ["user_id", `eq.${userId}`],
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
      ["user_id", `eq.${userId}`],
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
      ["user_id", `eq.${userId}`],
      ["order", "created_at.desc"],
      ["limit", 1],
    ])}`
  );
  return rows[0] ?? null;
}
