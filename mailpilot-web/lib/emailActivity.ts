export interface ProcessedEmailRow {
  id: number;
  gmail_message_id: string;
  account_id: number;
  accounts: { email: string } | null;
  category: string;
  subject: string | null;
  sender: string | null;
  processed_at: string;
  message_received_at: string | null;
  actions_taken: string | null;
  was_archived: boolean;
  applied_label_names: string | null;
  proposed_action?: string | null;
  resolution_status?: string | null;
  inbox_status?: string | null;
  category_id?: number | null;
  /** Demo fixtures only — classification rationale for UI preview */
  classification_note?: string | null;
}

export const EMAIL_ACTIVITY_PAGE_SIZE = 50;

/** Max rows shown on the Overview activity preview (not the full Activity page). */
export const OVERVIEW_ACTIVITY_PREVIEW_LIMIT = 10;

export const EMAIL_ACTIVITY_SELECT =
  "id,gmail_message_id,account_id,accounts(email),category,subject,sender,processed_at,message_received_at,actions_taken,was_archived,applied_label_names,proposed_action,resolution_status,inbox_status,category_id";

/** Parse From-style strings: "Name" <a@b>, Name <a@b>, a@b */
export function parseSender(raw: string | null): {
  displayName: string;
  address: string | null;
} {
  if (!raw?.trim()) {
    return { displayName: "Unknown", address: null };
  }
  const s = raw.trim();
  const angle = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    let name = angle[1].trim();
    const addr = angle[2].trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1);
    }
    const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
    if (!name && emailLike) {
      return { displayName: addr.split("@")[0] || addr, address: addr };
    }
    return {
      displayName: name || addr.split("@")[0] || addr,
      address: emailLike ? addr : null,
    };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { displayName: s.split("@")[0] || s, address: s };
  }
  return { displayName: s, address: null };
}

export function truncateText(s: string | null | undefined, max = 48): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function isUndone(actions: string | null): boolean {
  return (actions ?? "").includes("[UNDONE]");
}

export function canUndo(row: ProcessedEmailRow): boolean {
  if (isUndone(row.actions_taken)) return false;
  const hasLabels =
    row.applied_label_names !== null && row.applied_label_names !== "[]";
  return hasLabels || row.was_archived;
}

/** Display-only chips parsed from runner `actions_taken` text. */
export function parseActionChips(actions: string | null): string[] {
  if (!actions?.trim()) return [];

  const text = actions.replace(/\s*\[UNDONE\]\s*/gi, "").trim();
  if (!text) return [];

  const chips: string[] = [];
  for (const part of text.split(/;\s*/)) {
    const p = part.trim();
    if (!p) continue;
    const lower = p.toLowerCase();

    if (lower.startsWith("labeled:") || lower.startsWith("labeled ")) {
      if (!chips.includes("Labeled")) chips.push("Labeled");
    } else if (lower.includes("archived")) {
      if (!chips.includes("Archived")) chips.push("Archived");
    } else if (lower.includes("spam")) {
      if (!chips.includes("Spam")) chips.push("Spam");
    } else if (lower.includes("no mailpilot gmail changes")) {
      if (!chips.includes("No changes")) chips.push("No changes");
    } else if (lower.startsWith("processed as")) {
      if (!chips.includes("Processed")) chips.push("Processed");
    }
  }

  return chips.slice(0, 4);
}

export function rowMatchesSearch(row: ProcessedEmailRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const subject = (row.subject ?? "").toLowerCase();
  const sender = (row.sender ?? "").toLowerCase();
  const { displayName, address } = parseSender(row.sender);
  return (
    subject.includes(q) ||
    sender.includes(q) ||
    displayName.toLowerCase().includes(q) ||
    (address?.toLowerCase().includes(q) ?? false)
  );
}
