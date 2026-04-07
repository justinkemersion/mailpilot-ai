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
    raw_labels           TEXT,
    sender               TEXT,
    actions_taken        TEXT,
    was_archived         BOOLEAN      NOT NULL DEFAULT FALSE,
    applied_label_names  TEXT,
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
