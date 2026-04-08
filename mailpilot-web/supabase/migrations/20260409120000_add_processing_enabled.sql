-- Pause background processing per connected account without removing the link.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS processing_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.accounts.processing_enabled IS
  'When false, the MailPilot worker skips this account in scheduled and manual runs.';
