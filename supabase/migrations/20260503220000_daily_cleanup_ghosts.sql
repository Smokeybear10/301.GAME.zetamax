-- ============================================================================
-- Daily ghost-forfeit cleanup.
--
-- Bug: visiting /competitive/daily/{date} mounted the page and created a
-- "pending" runs row even before the user typed anything. If they went back
-- without playing, then later revisited that day, /api/runs/start flipped
-- pending -> forfeited (treating the second visit as "you bailed"). The
-- calendar then displayed the day as forfeited even though no problem was
-- ever attempted.
--
-- Fix in code: /api/runs/start now resumes pending daily rows on revisit
-- (resets started_at; same run_id; same seed). This migration cleans up the
-- existing ghost rows so the calendar stops showing fake forfeits.
--
-- Detection: any 'forfeited' / 'abandoned' / 'rejected_incomplete' daily row
-- whose client_payload IS NULL never had events submitted, so the user never
-- actually played it. Safe to delete.
-- ============================================================================

DELETE FROM public.runs
WHERE mode = 'daily'
  AND validation_status IN ('forfeited', 'abandoned', 'rejected_incomplete')
  AND client_payload IS NULL;
