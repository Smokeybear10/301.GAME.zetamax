-- Zetamax v1 — abandoned-runs cron
-- Marks stale 'pending' runs as 'abandoned' so the /api/runs/start rate-limit
-- query (which filters on validation_status='pending' AND started_at within
-- the last 125s) doesn't grow unbounded as users close tabs mid-round.
-- Runs nightly via pg_cron. Idempotent: safe to re-run the migration.

-- ============================================================================
-- pg_cron is shipped with Supabase but lives in the `extensions` schema and
-- needs explicit CREATE EXTENSION. Restricted to the cron extension's own
-- schema; the API/auth roles never gain scheduling powers.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================================
-- mark_abandoned_runs(): the actual sweep. SECURITY DEFINER so the cron job
-- can update rows it doesn't own; the function is trusted because it only
-- ever flips pending → abandoned (no PII exposure, no score writes).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_abandoned_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.runs
  SET validation_status = 'abandoned',
      completed_at = now()
  WHERE validation_status = 'pending'
    AND started_at < now() - interval '125 seconds';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Only the cron role / postgres needs to call this. Lock everyone else out.
REVOKE ALL ON FUNCTION public.mark_abandoned_runs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_abandoned_runs() FROM anon, authenticated;

-- ============================================================================
-- Schedule. Idempotent: unschedule any existing job with the same name first,
-- then create a fresh schedule. Runs daily at 04:00 UTC (off-peak for US/EU).
-- ============================================================================
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid
  FROM cron.job
  WHERE jobname = 'mark-abandoned-runs';

  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'mark-abandoned-runs',
    '0 4 * * *',
    $cron$SELECT public.mark_abandoned_runs();$cron$
  );
END $$;
