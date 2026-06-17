export type MailActionTaken =
  | "label"
  | "archive"
  | "keep"
  | "archive_blocked"
  | "undo_archive"
  | "teach"
  | "teach_revert"
  | "cleanup_archive"
  | "cleanup_keep";

export interface MailActionLogRow {
  id: number;
  user_id: string;
  account_id: number;
  processed_email_id: number | null;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  category_id: number | null;
  preference_id: number | null;
  action_taken: MailActionTaken;
  reason_json: Record<string, unknown>;
  previous_state_json: Record<string, unknown> | null;
  created_at: string;
  accounts?: { email: string } | { email: string }[] | null;
}

export const ACTION_LOG_SELECT =
  "id,user_id,account_id,processed_email_id,gmail_message_id,gmail_thread_id,category_id,preference_id,action_taken,reason_json,previous_state_json,created_at";

export const ACTION_LOG_PAGE_SIZE = 50;

export function accountEmailFromLog(row: MailActionLogRow): string | null {
  if (!row.accounts) return null;
  return Array.isArray(row.accounts) ? row.accounts[0]?.email ?? null : row.accounts.email;
}

export function reasonSummary(row: MailActionLogRow): string {
  const summary = row.reason_json?.summary;
  if (typeof summary === "string" && summary.trim()) return summary;
  return actionTakenLabel(row.action_taken);
}

export function actionTakenLabel(action: MailActionTaken): string {
  switch (action) {
    case "cleanup_archive":
      return "Archived from Cleanup";
    case "cleanup_keep":
      return "Kept from Cleanup";
    case "archive_blocked":
      return "Archive blocked";
    case "teach":
      return "Preference taught";
    case "teach_revert":
      return "Teach reverted";
    case "undo_archive":
      return "Archive undone";
    case "archive":
      return "Archived";
    case "keep":
      return "Kept in inbox";
    case "label":
      return "Labeled";
  }
}

export function isAuditAction(action: MailActionTaken): boolean {
  return action !== "label";
}

export function isBlockedAction(action: MailActionTaken): boolean {
  return action === "archive_blocked";
}
