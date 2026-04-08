-- Atomic job claim (FOR UPDATE SKIP LOCKED) and stale running-job reaper for watch-jobs.

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
      completed_at = now()
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
