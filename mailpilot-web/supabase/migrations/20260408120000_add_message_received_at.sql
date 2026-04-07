-- MailPilot: store Gmail internalDate so the dashboard can sort by when the
-- email arrived, not when MailPilot processed it.
-- Safe to run multiple times.

ALTER TABLE public.processed_emails
  ADD COLUMN IF NOT EXISTS message_received_at TIMESTAMPTZ;

COMMENT ON COLUMN public.processed_emails.message_received_at IS
  'UTC time from Gmail internalDate (message arrival in mailbox).';
