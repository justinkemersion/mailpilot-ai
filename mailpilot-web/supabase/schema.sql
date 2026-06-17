-- ============================================================
-- MailPilot AI — Supabase Schema (Phase 1)
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- accounts
-- Mirrors mailpilot-runner/mailpilot/database.py AccountRepository.
-- Each row belongs to one Supabase Auth user (user_id).
-- ============================================================
CREATE TABLE public.accounts (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email         TEXT         NOT NULL,
    display_name  TEXT,
    token_json    TEXT         NOT NULL,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    processing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    purpose       TEXT         NOT NULL DEFAULT 'other'
                  CHECK (purpose IN ('personal', 'work_delivery', 'business', 'other')),
    default_archive_policy TEXT NOT NULL DEFAULT 'ask_first'
                  CHECK (default_archive_policy IN ('keep_inbox', 'ask_first', 'never_archive')),
    security_posture TEXT      NOT NULL DEFAULT 'standard'
                  CHECK (security_posture IN ('strict', 'standard', 'relaxed')),
    scope_configured_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- One Supabase user can only have one row per Gmail address.
    UNIQUE(user_id, email)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts: select own"
    ON public.accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "accounts: insert own"
    ON public.accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "accounts: update own"
    ON public.accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "accounts: delete own"
    ON public.accounts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- mail_categories
-- System and account-scoped category policy rows.
-- ============================================================
CREATE TABLE public.mail_categories (
    id              BIGSERIAL    PRIMARY KEY,
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

CREATE UNIQUE INDEX mail_categories_global_unique_idx
    ON public.mail_categories (user_id, slug)
    WHERE account_id IS NULL;

CREATE UNIQUE INDEX mail_categories_account_unique_idx
    ON public.mail_categories (user_id, account_id, slug)
    WHERE account_id IS NOT NULL;

ALTER TABLE public.mail_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_categories: select own"
    ON public.mail_categories FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "mail_categories: insert own"
    ON public.mail_categories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mail_categories: update own"
    ON public.mail_categories FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "mail_categories: delete own"
    ON public.mail_categories FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- processed_emails
-- Mirrors mailpilot-runner/mailpilot/database.py ProcessedEmailRepository.
-- user_id is denormalized here (not only on accounts) so RLS
-- can use a direct auth.uid() = user_id check without a join.
-- ============================================================
CREATE TABLE public.processed_emails (
    id                   BIGSERIAL    PRIMARY KEY,
    user_id              UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id           BIGINT       NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    gmail_message_id     TEXT         NOT NULL,
    gmail_thread_id      TEXT,
    category             TEXT         NOT NULL,
    subject              TEXT,
    processed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Gmail internalDate (ms since epoch) converted to UTC; used for history sort/display.
    message_received_at  TIMESTAMPTZ,
    raw_labels           TEXT,
    sender               TEXT,
    actions_taken        TEXT,
    was_archived         BOOLEAN      NOT NULL DEFAULT FALSE,
    applied_label_names  TEXT,
    proposed_action      TEXT,
    resolution_status    TEXT         NOT NULL DEFAULT 'unresolved'
                                      CHECK (resolution_status IN ('unresolved', 'kept', 'archived', 'needs_attention', 'blocked')),
    inbox_status         TEXT         DEFAULT 'unknown'
                                      CHECK (inbox_status IN ('in_inbox', 'archived', 'unknown')),
    category_id          BIGINT       REFERENCES public.mail_categories(id),
    -- Preserves the original SQLite idempotency guarantee.
    UNIQUE(account_id, gmail_message_id)
);

ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emails: select own"
    ON public.processed_emails FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "emails: insert own"
    ON public.processed_emails FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "emails: update own"
    ON public.processed_emails FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "emails: delete own"
    ON public.processed_emails FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- mail_action_log
-- Append-only audit for labels, cleanup actions, blocked actions, and undo.
-- ============================================================
CREATE TABLE public.mail_action_log (
    id                  BIGSERIAL    PRIMARY KEY,
    user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id          BIGINT       NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    processed_email_id  BIGINT       REFERENCES public.processed_emails(id) ON DELETE SET NULL,
    gmail_message_id    TEXT         NOT NULL,
    gmail_thread_id     TEXT,
    category_id         BIGINT       REFERENCES public.mail_categories(id) ON DELETE SET NULL,
    preference_id       BIGINT,
    action_taken        TEXT         NOT NULL
                                       CHECK (action_taken IN ('label', 'archive', 'keep', 'archive_blocked', 'undo_archive', 'teach', 'cleanup_archive', 'cleanup_keep')),
    reason_json         JSONB        NOT NULL,
    previous_state_json JSONB,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX mail_action_log_user_created_idx
    ON public.mail_action_log (user_id, created_at DESC);

CREATE INDEX mail_action_log_account_created_idx
    ON public.mail_action_log (account_id, created_at DESC);

ALTER TABLE public.mail_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_action_log: select own"
    ON public.mail_action_log FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "mail_action_log: insert own"
    ON public.mail_action_log FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- processing_claims
-- Lightweight per-message claims so overlapping runners do not
-- classify the same Gmail message at the same time.
-- ============================================================
CREATE TABLE public.processing_claims (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id       BIGINT       NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    gmail_message_id TEXT         NOT NULL,
    claimed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS processing_claims_claimed_at_idx
    ON public.processing_claims (claimed_at);

ALTER TABLE public.processing_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "processing_claims: select own"
    ON public.processing_claims FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "processing_claims: insert own"
    ON public.processing_claims FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "processing_claims: delete own"
    ON public.processing_claims FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- run_jobs
-- Job queue for triggering Python worker runs from the web app.
-- The web app inserts a 'pending' row; the Python runner claims
-- and executes it via the 'watch-jobs' command.
-- Service role (Python runner) bypasses RLS for UPDATE/SELECT.
-- ============================================================
CREATE TABLE public.run_jobs (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status       TEXT         NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'done', 'failed')),
    options      JSONB        NOT NULL DEFAULT '{}',
    result       JSONB,
    error        TEXT,
    progress     JSONB,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS run_jobs_one_active_per_user_idx
    ON public.run_jobs (user_id)
    WHERE status IN ('pending', 'running');

ALTER TABLE public.run_jobs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.run_jobs;

ALTER TABLE public.run_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_jobs: select own"
    ON public.run_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "run_jobs: insert own"
    ON public.run_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Claim next pending job atomically (watch-jobs). Service role only.
CREATE OR REPLACE FUNCTION public.claim_next_run_job()
RETURNS SETOF public.run_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.run_jobs r
  SET status = 'running', started_at = now()
  FROM (
    SELECT id
    FROM public.run_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) AS picked
  WHERE r.id = picked.id
  RETURNING r.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.reap_stale_run_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH updated AS (
    UPDATE public.run_jobs
    SET
      status = 'failed',
      error = 'Job timed out or worker crashed.',
      completed_at = now(),
      progress = NULL
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < now() - interval '15 minutes'
    RETURNING id
  )
  SELECT count(*)::integer INTO n FROM updated;
  RETURN COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_run_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_stale_run_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_run_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_stale_run_jobs() TO service_role;

-- ============================================================
-- One-time migration (existing projects that already have
-- processed_emails without message_received_at). Run in SQL Editor:
--   ALTER TABLE public.processed_emails
--     ADD COLUMN IF NOT EXISTS message_received_at TIMESTAMPTZ;
-- ============================================================
