-- Phase 9D: cleanup action audit foundation.

CREATE TABLE IF NOT EXISTS public.mail_action_log (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id          BIGINT      NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  processed_email_id  BIGINT      REFERENCES public.processed_emails(id) ON DELETE SET NULL,
  gmail_message_id    TEXT        NOT NULL,
  gmail_thread_id     TEXT,
  category_id         BIGINT      REFERENCES public.mail_categories(id) ON DELETE SET NULL,
  preference_id       BIGINT,
  action_taken        TEXT        NOT NULL
                      CHECK (action_taken IN (
                        'label',
                        'archive',
                        'keep',
                        'archive_blocked',
                        'undo_archive',
                        'teach',
                        'cleanup_archive',
                        'cleanup_keep'
                      )),
  reason_json         JSONB       NOT NULL,
  previous_state_json JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_action_log_user_created_idx
  ON public.mail_action_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mail_action_log_account_created_idx
  ON public.mail_action_log (account_id, created_at DESC);

ALTER TABLE public.mail_action_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_action_log: select own'
  ) THEN
    CREATE POLICY "mail_action_log: select own"
      ON public.mail_action_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_action_log: insert own'
  ) THEN
    CREATE POLICY "mail_action_log: insert own"
      ON public.mail_action_log FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.processed_emails
  ADD COLUMN IF NOT EXISTS proposed_action TEXT,
  ADD COLUMN IF NOT EXISTS inbox_status TEXT DEFAULT 'unknown'
    CHECK (inbox_status IN ('in_inbox', 'archived', 'unknown'));
