-- Incremental sync progress for the web UI + Supabase Realtime.
ALTER TABLE public.run_jobs
    ADD COLUMN IF NOT EXISTS progress JSONB;

COMMENT ON COLUMN public.run_jobs.progress IS
    'Latest progress: {"phase": string, "message": string, "timestamp": string} (ISO8601).';

-- Full row payloads for postgres_changes UPDATE events (Supabase Realtime).
ALTER TABLE public.run_jobs REPLICA IDENTITY FULL;

-- Expose run_jobs to Realtime subscribers (dashboard uses filtered postgres_changes).
ALTER PUBLICATION supabase_realtime ADD TABLE public.run_jobs;

-- Clear stale progress when the reaper marks a job failed.
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
