-- Phase 9B: mailbox scope columns on accounts (1:1 with connected Gmail).

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'other'
    CHECK (purpose IN ('personal', 'work_delivery', 'business', 'other')),
  ADD COLUMN IF NOT EXISTS default_archive_policy TEXT NOT NULL DEFAULT 'ask_first'
    CHECK (default_archive_policy IN ('keep_inbox', 'ask_first', 'never_archive')),
  ADD COLUMN IF NOT EXISTS security_posture TEXT NOT NULL DEFAULT 'standard'
    CHECK (security_posture IN ('strict', 'standard', 'relaxed')),
  ADD COLUMN IF NOT EXISTS scope_configured_at TIMESTAMPTZ;

COMMENT ON COLUMN public.accounts.purpose IS
  'Mailbox category: personal, work_delivery, business, or other.';
COMMENT ON COLUMN public.accounts.default_archive_policy IS
  'Account-level resolution fallback; archive is not allowed here (category/preference only).';
COMMENT ON COLUMN public.accounts.security_posture IS
  'How cautiously security-adjacent mail is handled for this mailbox.';
COMMENT ON COLUMN public.accounts.scope_configured_at IS
  'When the user set mailbox purpose; NULL prompts first-connect configuration.';
