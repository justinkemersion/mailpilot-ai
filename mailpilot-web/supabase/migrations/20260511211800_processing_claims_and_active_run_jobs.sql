-- Prevent overlapping classifications of the same Gmail message and
-- limit users to one active run job at a time.

CREATE TABLE IF NOT EXISTS public.processing_claims (
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'processing_claims'
          AND policyname = 'processing_claims: select own'
    ) THEN
        CREATE POLICY "processing_claims: select own"
            ON public.processing_claims FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'processing_claims'
          AND policyname = 'processing_claims: insert own'
    ) THEN
        CREATE POLICY "processing_claims: insert own"
            ON public.processing_claims FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'processing_claims'
          AND policyname = 'processing_claims: delete own'
    ) THEN
        CREATE POLICY "processing_claims: delete own"
            ON public.processing_claims FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS run_jobs_one_active_per_user_idx
    ON public.run_jobs (user_id)
    WHERE status IN ('pending', 'running');
