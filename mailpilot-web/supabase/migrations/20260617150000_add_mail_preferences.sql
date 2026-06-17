-- Phase 9E: scoped user preferences for teach + policy resolution.

CREATE TABLE IF NOT EXISTS public.mail_preferences (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id            BIGINT      NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  match_type            TEXT        NOT NULL
                        CHECK (match_type IN ('sender', 'sender_domain', 'subject_pattern', 'category', 'composite')),
  match_conditions_json JSONB       NOT NULL,
  category_id           BIGINT      REFERENCES public.mail_categories(id) ON DELETE SET NULL,
  action_policy         TEXT        NOT NULL
                        CHECK (action_policy IN ('keep_inbox', 'archive', 'ask_first', 'nudge', 'never_archive')),
  confidence_threshold  REAL        DEFAULT 0.0,
  source                TEXT        NOT NULL DEFAULT 'user'
                        CHECK (source IN ('user', 'system_seed')),
  enabled               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_preferences_account_enabled_idx
  ON public.mail_preferences (account_id)
  WHERE enabled;

ALTER TABLE public.mail_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_preferences: select own'
  ) THEN
    CREATE POLICY "mail_preferences: select own"
      ON public.mail_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_preferences: insert own'
  ) THEN
    CREATE POLICY "mail_preferences: insert own"
      ON public.mail_preferences FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_preferences: update own'
  ) THEN
    CREATE POLICY "mail_preferences: update own"
      ON public.mail_preferences FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_preferences: delete own'
  ) THEN
    CREATE POLICY "mail_preferences: delete own"
      ON public.mail_preferences FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.mail_action_log
  DROP CONSTRAINT IF EXISTS mail_action_log_preference_id_fkey;

ALTER TABLE public.mail_action_log
  ADD CONSTRAINT mail_action_log_preference_id_fkey
  FOREIGN KEY (preference_id) REFERENCES public.mail_preferences(id) ON DELETE SET NULL;
