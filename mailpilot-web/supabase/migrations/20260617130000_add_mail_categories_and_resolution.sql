-- Phase 9C: mail_categories table and resolution columns on processed_emails.

CREATE TABLE IF NOT EXISTS public.mail_categories (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      BIGINT       REFERENCES public.accounts(id) ON DELETE CASCADE,
  slug            TEXT         NOT NULL,
  name            TEXT         NOT NULL,
  label_name      TEXT         NOT NULL,
  default_action  TEXT         NOT NULL DEFAULT 'keep_inbox',
  safety_tier     TEXT         NOT NULL DEFAULT 'review'
                  CHECK (safety_tier IN ('safe_auto', 'review', 'never_auto')),
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mail_categories_global_unique_idx
  ON public.mail_categories (user_id, slug)
  WHERE account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mail_categories_account_unique_idx
  ON public.mail_categories (user_id, account_id, slug)
  WHERE account_id IS NOT NULL;

ALTER TABLE public.mail_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_categories: select own'
  ) THEN
    CREATE POLICY "mail_categories: select own"
      ON public.mail_categories FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_categories: insert own'
  ) THEN
    CREATE POLICY "mail_categories: insert own"
      ON public.mail_categories FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_categories: update own'
  ) THEN
    CREATE POLICY "mail_categories: update own"
      ON public.mail_categories FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_categories: delete own'
  ) THEN
    CREATE POLICY "mail_categories: delete own"
      ON public.mail_categories FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.processed_emails
  ADD COLUMN IF NOT EXISTS proposed_action TEXT,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (resolution_status IN ('unresolved', 'kept', 'archived', 'needs_attention', 'blocked')),
  ADD COLUMN IF NOT EXISTS inbox_status TEXT DEFAULT 'unknown'
    CHECK (inbox_status IN ('in_inbox', 'archived', 'unknown')),
  ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES public.mail_categories(id);
