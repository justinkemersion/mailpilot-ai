-- Phase 9B: mailbox scope columns on accounts.

alter table api.accounts
  add column if not exists purpose text not null default 'other'
    check (purpose in ('personal', 'work_delivery', 'business', 'other')),
  add column if not exists default_archive_policy text not null default 'ask_first'
    check (default_archive_policy in ('keep_inbox', 'ask_first', 'never_archive')),
  add column if not exists security_posture text not null default 'standard'
    check (security_posture in ('strict', 'standard', 'relaxed')),
  add column if not exists scope_configured_at timestamptz;

comment on column api.accounts.purpose is
  'Mailbox category: personal, work_delivery, business, or other.';
comment on column api.accounts.default_archive_policy is
  'Account-level resolution fallback; archive is not allowed here (category/preference only).';
comment on column api.accounts.security_posture is
  'How cautiously security-adjacent mail is handled for this mailbox.';
comment on column api.accounts.scope_configured_at is
  'When the user set mailbox purpose; NULL prompts first-connect configuration.';
