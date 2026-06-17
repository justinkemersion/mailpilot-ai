import type { RunJobRow } from "@/app/api/run/route";
import type {
  ConnectedAccount,
  DashboardMetrics,
  EmailActivityPage,
} from "@/lib/dashboard/queries";
import type { ProcessedEmailRow } from "@/lib/emailActivity";
import { CATEGORY_ORDER } from "@/lib/categories";
import { groupCleanupCandidates, type CleanupGroup } from "@/lib/cleanup";

export interface DemoPreference {
  id: string;
  title: string;
  description: string;
  example: string;
}

export const DEMO_PREFERENCES: DemoPreference[] = [
  {
    id: "gmail-signin-work-device",
    title: "Gmail sign-in alerts on work devices",
    description:
      "When a recurring “New sign-in from Gmail” notice matches your work laptop context, treat it as expected security noise instead of urgent mail.",
    example:
      "“New sign-in from Gmail” + device label “Chris-MBP” → archive as low-priority security notice",
  },
];

export const DEMO_ACCOUNTS: ConnectedAccount[] = [
  {
    id: 1,
    email: "chris.personal@gmail.com",
    display_name: "Chris",
    active: true,
    processing_enabled: true,
    purpose: "personal",
    default_archive_policy: "ask_first",
    security_posture: "strict",
    scope_configured_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: 2,
    email: "chris@acmecorp.io",
    display_name: "Chris (Work)",
    active: true,
    processing_enabled: true,
    purpose: "work_delivery",
    default_archive_policy: "ask_first",
    security_posture: "relaxed",
    scope_configured_at: "2026-06-01T10:00:00.000Z",
  },
];

type DemoEmail = ProcessedEmailRow & { classification_note?: string };

function email(row: DemoEmail): ProcessedEmailRow {
  return row;
}

export const DEMO_PROCESSED_EMAILS: ProcessedEmailRow[] = [
  email({
    id: 101,
    gmail_message_id: "demo-msg-101",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "important",
    subject: "Security alert: new sign-in to your Google Account",
    sender: "Google <no-reply@accounts.google.com>",
    processed_at: "2026-06-09T14:20:00.000Z",
    message_received_at: "2026-06-09T14:15:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
    classification_note:
      "94% confidence — Unusual sign-in location; flagged for review despite automated sender.",
  }),
  email({
    id: 102,
    gmail_message_id: "demo-msg-102",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "important",
    subject: "Re: Can you review the contract by EOD?",
    sender: "Jordan Lee <jordan@acmecorp.io>",
    processed_at: "2026-06-09T13:05:00.000Z",
    message_received_at: "2026-06-09T12:50:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
    classification_note:
      "91% confidence — Direct human follow-up with a deadline; needs reply.",
  }),
  email({
    id: 103,
    gmail_message_id: "demo-msg-103",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Your Xfinity bill for June is ready",
    sender: "Xfinity <billing@xfinity.com>",
    processed_at: "2026-06-09T11:30:00.000Z",
    message_received_at: "2026-06-09T11:20:00.000Z",
    actions_taken: "Labeled: receipts; Archived",
    was_archived: true,
    applied_label_names: '["receipts","INBOX"]',
  }),
  email({
    id: 104,
    gmail_message_id: "demo-msg-104",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Your receipt from Amazon.com",
    sender: "Amazon <order-update@amazon.com>",
    processed_at: "2026-06-09T10:45:00.000Z",
    message_received_at: "2026-06-09T10:40:00.000Z",
    actions_taken: "Labeled: receipts; Archived",
    was_archived: true,
    applied_label_names: '["receipts","INBOX"]',
  }),
  email({
    id: 105,
    gmail_message_id: "demo-msg-105",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "work",
    subject: "[acmecorp/platform] Pull request #842: Inbox classifier tuning",
    sender: "GitHub <notifications@github.com>",
    processed_at: "2026-06-09T09:15:00.000Z",
    message_received_at: "2026-06-09T09:00:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
    classification_note:
      "88% confidence — GitHub notification on a repo you contribute to.",
  }),
  email({
    id: 106,
    gmail_message_id: "demo-msg-106",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Payment receipt — Stripe invoice #INV-2026-0612",
    sender: "Stripe <invoice+statements@stripe.com>",
    processed_at: "2026-06-08T22:10:00.000Z",
    message_received_at: "2026-06-08T22:00:00.000Z",
    actions_taken: "Labeled: receipts",
    was_archived: false,
    applied_label_names: '["receipts"]',
  }),
  email({
    id: 107,
    gmail_message_id: "demo-msg-107",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "work",
    subject: "Sprint planning — Q3 roadmap review",
    sender: "Morgan Chen <morgan@acmecorp.io>",
    processed_at: "2026-06-08T19:30:00.000Z",
    message_received_at: "2026-06-08T19:15:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
  }),
  email({
    id: 108,
    gmail_message_id: "demo-msg-108",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "newsletters",
    subject: "The Pragmatic Engineer — weekly digest",
    sender: "Pragmatic Engineer <digest@newsletter.io>",
    processed_at: "2026-06-08T16:00:00.000Z",
    message_received_at: "2026-06-08T15:45:00.000Z",
    actions_taken: "Labeled: newsletters; Archived",
    was_archived: true,
    applied_label_names: '["newsletters","INBOX"]',
  }),
  email({
    id: 109,
    gmail_message_id: "demo-msg-109",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "promotions",
    subject: "40% off annual Pro — this weekend only",
    sender: "DevTools Weekly <promo@devtools.io>",
    processed_at: "2026-06-08T14:20:00.000Z",
    message_received_at: "2026-06-08T14:10:00.000Z",
    actions_taken: "Labeled: promotions; Archived",
    was_archived: true,
    applied_label_names: '["promotions","INBOX"]',
  }),
  email({
    id: 110,
    gmail_message_id: "demo-msg-110",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "personal",
    subject: "Dinner on Thursday?",
    sender: "Sam Rivera <sam.rivera@gmail.com>",
    processed_at: "2026-06-08T12:40:00.000Z",
    message_received_at: "2026-06-08T12:30:00.000Z",
    actions_taken: "Labeled: personal",
    was_archived: false,
    applied_label_names: '["personal"]',
  }),
  email({
    id: 111,
    gmail_message_id: "demo-msg-111",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "important",
    subject: "Production deploy checklist — action required",
    sender: "Ops Bot <ops@acmecorp.io>",
    processed_at: "2026-06-08T10:00:00.000Z",
    message_received_at: "2026-06-08T09:45:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
  }),
  email({
    id: 112,
    gmail_message_id: "demo-msg-112",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "spam",
    subject: "You won a free cruise!!!",
    sender: "Prizes <winner@sketchy-mail.net>",
    processed_at: "2026-06-07T18:00:00.000Z",
    message_received_at: "2026-06-07T17:55:00.000Z",
    actions_taken: "Marked as spam",
    was_archived: false,
    applied_label_names: '["SPAM"]',
    classification_note:
      "97% confidence — Promotional scam pattern; no legitimate sender reputation.",
  }),
  email({
    id: 113,
    gmail_message_id: "demo-msg-113",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "work",
    subject: "Re: API schema review",
    sender: "Alex Kim <alex.kim@acmecorp.io>",
    processed_at: "2026-06-07T15:20:00.000Z",
    message_received_at: "2026-06-07T15:05:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
  }),
  email({
    id: 114,
    gmail_message_id: "demo-msg-114",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "newsletters",
    subject: "Hacker News digest — top posts",
    sender: "HN Digest <digest@hn.io>",
    processed_at: "2026-06-07T09:30:00.000Z",
    message_received_at: "2026-06-07T09:15:00.000Z",
    actions_taken: "Labeled: newsletters; Archived",
    was_archived: true,
    applied_label_names: '["newsletters","INBOX"]',
  }),
  email({
    id: 115,
    gmail_message_id: "demo-msg-115",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Chase credit card payment received",
    sender: "Chase <no-reply@chase.com>",
    processed_at: "2026-06-06T20:00:00.000Z",
    message_received_at: "2026-06-06T19:50:00.000Z",
    actions_taken: "Labeled: receipts; Archived",
    was_archived: true,
    applied_label_names: '["receipts","INBOX"]',
  }),
  email({
    id: 116,
    gmail_message_id: "demo-msg-116",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "important",
    subject: "Appointment reminder: Dentist — Jun 12 at 2:30 PM",
    sender: "HealthPortal <reminders@healthportal.com>",
    processed_at: "2026-06-06T16:30:00.000Z",
    message_received_at: "2026-06-06T16:15:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
  }),
  email({
    id: 117,
    gmail_message_id: "demo-msg-117",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "promotions",
    subject: "Last chance: KubeCon early bird pricing",
    sender: "KubeCon <events@cncf.io>",
    processed_at: "2026-06-06T14:00:00.000Z",
    message_received_at: "2026-06-06T13:50:00.000Z",
    actions_taken: "Labeled: promotions; Archived",
    was_archived: true,
    applied_label_names: '["promotions","INBOX"]',
  }),
  email({
    id: 118,
    gmail_message_id: "demo-msg-118",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "personal",
    subject: "Photos from the hike",
    sender: "Taylor Brooks <taylor.b@gmail.com>",
    processed_at: "2026-06-05T21:00:00.000Z",
    message_received_at: "2026-06-05T20:45:00.000Z",
    actions_taken: "Labeled: personal",
    was_archived: false,
    applied_label_names: '["personal"]',
  }),
  email({
    id: 119,
    gmail_message_id: "demo-msg-119",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "work",
    subject: "VPN certificate renewal notice",
    sender: "IT Helpdesk <it@acmecorp.io>",
    processed_at: "2026-06-05T17:30:00.000Z",
    message_received_at: "2026-06-05T17:15:00.000Z",
    actions_taken: "Labeled: work",
    was_archived: false,
    applied_label_names: '["work"]',
  }),
  email({
    id: 120,
    gmail_message_id: "demo-msg-120",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Your OpenAI API usage summary",
    sender: "OpenAI <billing@openai.com>",
    processed_at: "2026-06-05T08:00:00.000Z",
    message_received_at: "2026-06-05T07:45:00.000Z",
    actions_taken: "Labeled: receipts",
    was_archived: false,
    applied_label_names: '["receipts"]',
  }),
  email({
    id: 121,
    gmail_message_id: "demo-msg-121",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "newsletters",
    subject: "Morning Brew — market wrap",
    sender: "Morning Brew <hello@morningbrew.com>",
    processed_at: "2026-06-04T13:00:00.000Z",
    message_received_at: "2026-06-04T12:45:00.000Z",
    actions_taken: "Labeled: newsletters; Archived",
    was_archived: true,
    applied_label_names: '["newsletters","INBOX"]',
  }),
  email({
    id: 122,
    gmail_message_id: "demo-msg-122",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "important",
    subject: "Action required: complete security training",
    sender: "Compliance <compliance@acmecorp.io>",
    processed_at: "2026-06-04T10:30:00.000Z",
    message_received_at: "2026-06-04T10:15:00.000Z",
    actions_taken: "Labeled: important",
    was_archived: false,
    applied_label_names: '["important"]',
    classification_note:
      "86% confidence — HR compliance deadline; time-sensitive action.",
  }),
  email({
    id: 123,
    gmail_message_id: "demo-msg-123",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "promotions",
    subject: "Summer sale — 30% off home goods",
    sender: "Wayfair <deals@wayfair.com>",
    processed_at: "2026-06-03T19:00:00.000Z",
    message_received_at: "2026-06-03T18:50:00.000Z",
    actions_taken: "Labeled: promotions; Archived",
    was_archived: true,
    applied_label_names: '["promotions","INBOX"]',
  }),
  email({
    id: 124,
    gmail_message_id: "demo-msg-124",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "work",
    subject: "Weekly team standup notes",
    sender: "Notion <mail@notion.so>",
    processed_at: "2026-06-03T16:20:00.000Z",
    message_received_at: "2026-06-03T16:05:00.000Z",
    actions_taken: "Labeled: work; Archived",
    was_archived: true,
    applied_label_names: '["work","INBOX"]',
  }),
  email({
    id: 125,
    gmail_message_id: "demo-msg-125",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "receipts",
    subject: "Payment confirmation — Cloudflare Workers",
    sender: "Cloudflare <billing@cloudflare.com>",
    processed_at: "2026-06-03T12:30:00.000Z",
    message_received_at: "2026-06-03T12:15:00.000Z",
    actions_taken: "Labeled: receipts; Archived",
    was_archived: true,
    applied_label_names: '["receipts","INBOX"]',
  }),
  email({
    id: 126,
    gmail_message_id: "demo-msg-126",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "important",
    subject: "New sign-in from Gmail on Chris-MBP",
    sender: "Google <no-reply@accounts.google.com>",
    processed_at: "2026-06-02T09:00:00.000Z",
    message_received_at: "2026-06-02T08:55:00.000Z",
    actions_taken: "Labeled: important; Archived",
    was_archived: true,
    applied_label_names: '["important","INBOX"]',
    classification_note:
      "Preference preview — recurring sign-in on known work device; would downgrade after memory feature ships.",
  }),
  email({
    id: 127,
    gmail_message_id: "demo-msg-127",
    account_id: 2,
    accounts: { email: "chris@acmecorp.io" },
    category: "spam",
    subject: "URGENT: Verify your account now",
    sender: "Security Team <verify@phish-example.net>",
    processed_at: "2026-06-01T15:00:00.000Z",
    message_received_at: "2026-06-01T14:55:00.000Z",
    actions_taken: "Marked as spam",
    was_archived: false,
    applied_label_names: '["SPAM"]',
  }),
  email({
    id: 128,
    gmail_message_id: "demo-msg-128",
    account_id: 1,
    accounts: { email: "chris.personal@gmail.com" },
    category: "personal",
    subject: "Happy birthday!",
    sender: "Mom <mom.rivera@gmail.com>",
    processed_at: "2026-06-01T08:30:00.000Z",
    message_received_at: "2026-06-01T08:15:00.000Z",
    actions_taken: "Labeled: personal",
    was_archived: false,
    applied_label_names: '["personal"]',
  }),
];

export function getDemoCleanupGroups(): CleanupGroup[] {
  return groupCleanupCandidates(
    DEMO_PROCESSED_EMAILS.filter(
      (row) =>
        row.was_archived === false &&
        !((row.actions_taken ?? "").includes("[UNDONE]")) &&
        (row.resolution_status ?? "unresolved") === "unresolved"
    ).slice(0, 20)
  );
}

export const DEMO_SYNC_RUNS: RunJobRow[] = [
  {
    id: 9001,
    status: "done",
    options: { newer_than_days: 7, include_read: false, dry_run: false },
    result: {
      accounts_processed: 2,
      candidates: 22,
      processed: 18,
      labels_applied: 14,
      archived: 9,
      spam_marked: 2,
      dry_run: false,
      llm_calls: 11,
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
    created_at: "2026-06-09T14:00:00.000Z",
    started_at: "2026-06-09T14:01:00.000Z",
    completed_at: "2026-06-09T14:05:00.000Z",
  },
  {
    id: 9000,
    status: "done",
    options: { newer_than_days: 7, include_read: true, dry_run: false },
    result: {
      accounts_processed: 2,
      candidates: 15,
      processed: 12,
      labels_applied: 10,
      archived: 5,
      spam_marked: 0,
      dry_run: false,
      llm_calls: 8,
      prefiltered: 3,
      skipped_by_budget: 0,
      skipped_by_claim_conflict: 0,
      skipped_by_ai_limit: 0,
      ai_limit_hit: false,
      ai_provider: "openai",
      ai_model: "gpt-4.1-mini",
      ai_label: "OpenAI · gpt-4.1-mini",
    },
    error: "1 message skipped — label already applied by another client",
    progress: null,
    created_at: "2026-06-07T10:00:00.000Z",
    started_at: "2026-06-07T10:01:00.000Z",
    completed_at: "2026-06-07T10:04:00.000Z",
  },
  {
    id: 8999,
    status: "done",
    options: { newer_than_days: 14, include_read: false, dry_run: false },
    result: {
      accounts_processed: 1,
      candidates: 9,
      processed: 7,
      labels_applied: 6,
      archived: 3,
      spam_marked: 1,
      dry_run: false,
      llm_calls: 5,
      prefiltered: 2,
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
    created_at: "2026-06-04T18:00:00.000Z",
    started_at: "2026-06-04T18:01:00.000Z",
    completed_at: "2026-06-04T18:03:00.000Z",
  },
  {
    id: 8998,
    status: "failed",
    options: { newer_than_days: 7, include_read: false, dry_run: false },
    result: null,
    error: "Gmail API rate limit — retry scheduled",
    progress: null,
    created_at: "2026-06-02T08:00:00.000Z",
    started_at: "2026-06-02T08:01:00.000Z",
    completed_at: "2026-06-02T08:02:00.000Z",
  },
];

export const DEMO_LATEST_JOB: RunJobRow = DEMO_SYNC_RUNS[0];

let simulatedJobCounter = 9100;

export function createSimulatedDemoSyncJob(): RunJobRow {
  const now = new Date();
  const id = simulatedJobCounter++;
  return {
    id,
    status: "done",
    options: { newer_than_days: 7, include_read: false, dry_run: false },
    result: {
      accounts_processed: 2,
      candidates: 10,
      processed: 8,
      labels_applied: 6,
      archived: 3,
      spam_marked: 0,
      dry_run: false,
      llm_calls: 5,
      prefiltered: 2,
      skipped_by_budget: 0,
      skipped_by_claim_conflict: 0,
      skipped_by_ai_limit: 0,
      ai_limit_hit: false,
      ai_provider: "openai",
      ai_model: "gpt-4.1-mini",
      ai_label: "OpenAI · gpt-4.1-mini",
      demo_message: "Demo sync complete — 8 messages classified.",
    },
    error: null,
    progress: null,
    created_at: now.toISOString(),
    started_at: new Date(now.getTime() + 1000).toISOString(),
    completed_at: new Date(now.getTime() + 4000).toISOString(),
  };
}

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
  return {
    ...DEMO_LATEST_JOB,
    result: DEMO_LATEST_JOB.result ? { ...DEMO_LATEST_JOB.result } : null,
  };
}

export function getDemoSyncRunHistory(): RunJobRow[] {
  return DEMO_SYNC_RUNS.map((job) => ({
    ...job,
    result: job.result ? { ...job.result } : null,
  }));
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

export function getDemoEmailActivityPage(
  options: {
    offset?: number;
    limit?: number;
    category?: string | null;
  } = {}
): EmailActivityPage {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  let filtered = sortedDemoEmails();
  if (options.category) {
    filtered = filtered.filter((row) => row.category === options.category);
  }
  const rows = filtered.slice(offset, offset + limit);
  return { rows, total: filtered.length, offset, limit };
}

export function getDemoClassificationNote(
  row: ProcessedEmailRow
): string | null {
  const note = (row as DemoEmail).classification_note;
  return note ?? null;
}
