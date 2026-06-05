import type { RunJobRow } from "@/app/api/run/route";
import type {
  ConnectedAccount,
  DashboardMetrics,
  EmailActivityPage,
} from "@/lib/dashboard/queries";
import type { ProcessedEmailRow } from "@/lib/emailActivity";
import { CATEGORY_ORDER } from "@/lib/categories";

/** Server-only demo switch. Never use NEXT_PUBLIC_ for this flag. */
export function isDemoMode(): boolean {
  const value = process.env.MAILPILOT_DEMO_MODE?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/** Client may read this for banner UI only — does not control data routing. */
export function isDemoBannerEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_DEMO_BANNER?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export const DEMO_ACCOUNTS: ConnectedAccount[] = [
  {
    id: 1,
    email: "alex@personalmail.com",
    display_name: "Alex",
    active: true,
    processing_enabled: true,
  },
  {
    id: 2,
    email: "alex@flux.dev",
    display_name: "Alex (Work)",
    active: true,
    processing_enabled: true,
  },
];

export const DEMO_PROCESSED_EMAILS: ProcessedEmailRow[] = [
  {
    id: 101,
    gmail_message_id: "demo-msg-101",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "important",
    subject: "Your June invoice is ready",
    sender: "Billing <billing@saasco.io>",
    processed_at: "2026-06-03T17:55:00.000Z",
    message_received_at: "2026-06-03T17:40:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
  },
  {
    id: 102,
    gmail_message_id: "demo-msg-102",
    account_id: 2,
    accounts: { email: "alex@flux.dev" },
    category: "work",
    subject: "Sprint planning — Flux dashboard polish",
    sender: "Jordan Lee <jordan@flux.dev>",
    processed_at: "2026-06-03T16:20:00.000Z",
    message_received_at: "2026-06-03T16:05:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
  },
  {
    id: 103,
    gmail_message_id: "demo-msg-103",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "newsletters",
    subject: "The Pragmatic Engineer — weekly digest",
    sender: "Pragmatic Engineer <digest@newsletter.io>",
    processed_at: "2026-06-03T14:10:00.000Z",
    message_received_at: "2026-06-03T13:58:00.000Z",
    actions_taken: "Labeled: newsletters; Archived",
    was_archived: true,
    applied_label_names: '["newsletters","INBOX"]',
  },
  {
    id: 104,
    gmail_message_id: "demo-msg-104",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "receipts",
    subject: "Receipt for Cloudflare Workers AI",
    sender: "Cloudflare <billing@cloudflare.com>",
    processed_at: "2026-06-03T12:30:00.000Z",
    message_received_at: "2026-06-03T12:15:00.000Z",
    actions_taken: "Labeled: receipts; Archived",
    was_archived: true,
    applied_label_names: '["receipts","INBOX"]',
  },
  {
    id: 105,
    gmail_message_id: "demo-msg-105",
    account_id: 2,
    accounts: { email: "alex@flux.dev" },
    category: "promotions",
    subject: "40% off annual Pro — this weekend only",
    sender: "DevTools Weekly <promo@devtools.io>",
    processed_at: "2026-06-03T11:05:00.000Z",
    message_received_at: "2026-06-03T10:50:00.000Z",
    actions_taken: "Labeled: promotions; Archived",
    was_archived: true,
    applied_label_names: '["promotions","INBOX"]',
  },
  {
    id: 106,
    gmail_message_id: "demo-msg-106",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "personal",
    subject: "Dinner on Thursday?",
    sender: "Sam Rivera <sam.rivera@gmail.com>",
    processed_at: "2026-06-02T22:40:00.000Z",
    message_received_at: "2026-06-02T22:30:00.000Z",
    actions_taken: "Labeled: personal",
    was_archived: false,
    applied_label_names: '["personal"]',
  },
  {
    id: 107,
    gmail_message_id: "demo-msg-107",
    account_id: 2,
    accounts: { email: "alex@flux.dev" },
    category: "important",
    subject: "Production deploy checklist",
    sender: "Ops Bot <ops@flux.dev>",
    processed_at: "2026-06-02T19:15:00.000Z",
    message_received_at: "2026-06-02T19:00:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
  },
  {
    id: 108,
    gmail_message_id: "demo-msg-108",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "spam",
    subject: "You won a free cruise!!!",
    sender: "Prizes <winner@sketchy-mail.net>",
    processed_at: "2026-06-02T15:00:00.000Z",
    message_received_at: "2026-06-02T14:55:00.000Z",
    actions_taken: "Marked as spam",
    was_archived: false,
    applied_label_names: '["SPAM"]',
  },
  {
    id: 109,
    gmail_message_id: "demo-msg-109",
    account_id: 2,
    accounts: { email: "alex@flux.dev" },
    category: "work",
    subject: "Re: API schema review",
    sender: "Morgan Chen <morgan@flux.dev>",
    processed_at: "2026-06-02T13:20:00.000Z",
    message_received_at: "2026-06-02T13:05:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
  },
  {
    id: 110,
    gmail_message_id: "demo-msg-110",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "newsletters",
    subject: "Hacker News digest — top posts",
    sender: "HN Digest <digest@hn.io>",
    processed_at: "2026-06-01T09:30:00.000Z",
    message_received_at: "2026-06-01T09:15:00.000Z",
    actions_taken: "Labeled: newsletters; Archived",
    was_archived: true,
    applied_label_names: '["newsletters","INBOX"]',
  },
  {
    id: 111,
    gmail_message_id: "demo-msg-111",
    account_id: 1,
    accounts: { email: "alex@personalmail.com" },
    category: "receipts",
    subject: "Your OpenAI API usage summary",
    sender: "OpenAI <billing@openai.com>",
    processed_at: "2026-06-01T08:00:00.000Z",
    message_received_at: "2026-06-01T07:45:00.000Z",
    actions_taken: "Labeled: receipts",
    was_archived: false,
    applied_label_names: '["receipts"]',
  },
  {
    id: 112,
    gmail_message_id: "demo-msg-112",
    account_id: 2,
    accounts: { email: "alex@flux.dev" },
    category: "promotions",
    subject: "Last chance: conference early bird",
    sender: "KubeCon <events@cncf.io>",
    processed_at: "2026-05-31T18:00:00.000Z",
    message_received_at: "2026-05-31T17:50:00.000Z",
    actions_taken: "Labeled: promotions; Archived",
    was_archived: true,
    applied_label_names: '["promotions","INBOX"]',
  },
];

export const DEMO_LATEST_JOB: RunJobRow = {
  id: 9001,
  status: "done",
  options: { newer_than_days: 7, include_read: false, dry_run: false },
  result: {
    accounts_processed: 2,
    candidates: 18,
    processed: 14,
    labels_applied: 11,
    archived: 6,
    spam_marked: 1,
    dry_run: false,
    llm_calls: 9,
    prefiltered: 4,
    skipped_by_budget: 0,
    skipped_by_claim_conflict: 0,
    skipped_by_ai_limit: 0,
    ai_limit_hit: false,
    ai_provider: "openai",
    ai_model: "gpt-4.1-mini",
    ai_label: "OpenAI · gpt-4.1-mini",
  },
  error: null,
  progress: null,
  created_at: "2026-06-03T17:50:00.000Z",
  started_at: "2026-06-03T17:51:00.000Z",
  completed_at: "2026-06-03T17:55:00.000Z",
};

function sortedDemoEmails(): ProcessedEmailRow[] {
  return [...DEMO_PROCESSED_EMAILS].sort((a, b) => {
    const aTs = new Date(a.message_received_at ?? a.processed_at).getTime();
    const bTs = new Date(b.message_received_at ?? b.processed_at).getTime();
    return bTs - aTs;
  });
}

export function getDemoConnectedAccounts(): ConnectedAccount[] {
  return DEMO_ACCOUNTS.map((account) => ({ ...account }));
}

export function getDemoLatestJob(): RunJobRow {
  return { ...DEMO_LATEST_JOB, result: { ...DEMO_LATEST_JOB.result } };
}

export function getDemoLastSyncedByAccount(): Record<number, string> {
  const map: Record<number, string> = {};
  for (const row of sortedDemoEmails()) {
    if (map[row.account_id] == null) {
      map[row.account_id] = row.processed_at;
    }
  }
  return map;
}

export function getDemoDashboardMetrics(): DashboardMetrics {
  const emails = DEMO_PROCESSED_EMAILS;
  const by_category: Record<string, number> = {};
  for (const category of CATEGORY_ORDER) {
    const count = emails.filter((e) => e.category === category).length;
    if (count > 0) by_category[category] = count;
  }
  return {
    total_processed: emails.length,
    total_archived: emails.filter((e) => e.was_archived).length,
    total_labeled: emails.filter(
      (e) => e.applied_label_names && e.applied_label_names !== "[]"
    ).length,
    active_accounts: DEMO_ACCOUNTS.filter((a) => a.processing_enabled).length,
    by_category,
  };
}

export function getDemoEmailActivityPage(options: {
  offset?: number;
  limit?: number;
  category?: string | null;
} = {}): EmailActivityPage {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  let filtered = sortedDemoEmails();
  if (options.category) {
    filtered = filtered.filter((row) => row.category === options.category);
  }
  const rows = filtered.slice(offset, offset + limit);
  return { rows, total: filtered.length, offset, limit };
}
