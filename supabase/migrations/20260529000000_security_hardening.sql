-- Zetamax — security hardening
--
-- Three independent fixes, all idempotent:
--
--   1. Lock down apply_run_elo. It was GRANT EXECUTE TO authenticated, derives
--      the runner from the run row (not auth.uid()), and had no idempotency
--      guard — so any signed-in user could call it directly with the
--      browser-shipped publishable key (rpc('apply_run_elo', { p_run_id }))
--      to inflate their own rating or perturb another player's, using the
--      publicly-discoverable run UUIDs from replay/OG routes. The only
--      legitimate caller is app/api/runs/finish, which uses the service-role
--      admin client (createAdminClient) and bypasses grants — so revoking the
--      authenticated grant costs nothing and closes the hole. Mirrors how
--      mark_abandoned_runs is already locked down.
--
--   2. Make ELO application replay-safe at the data layer: a partial unique
--      index on rating_events.run_id means a second apply for the same run
--      rolls back instead of double-counting, even if the route is ever
--      called twice. run_id is nullable (ON DELETE SET NULL), so the index is
--      partial on (run_id IS NOT NULL).
--
--   3. Restore the anon EXECUTE grant on get_league_preview. The
--      20260526 league-remove-member migration did DROP FUNCTION + recreate
--      and re-granted only `authenticated`, silently dropping the anon grant
--      added in 20260516. That broke signed-out invite previews (the RPC
--      errors for anon → the page falls through to "League not found"
--      instead of the preview + "Sign in to join" CTA).

-- 1. apply_run_elo: service-role only.
REVOKE EXECUTE ON FUNCTION public.apply_run_elo(uuid) FROM anon, authenticated, PUBLIC;

-- 2. Idempotency: one rating event per run.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rating_events_run
  ON public.rating_events (run_id)
  WHERE run_id IS NOT NULL;

-- 3. Restore anon preview access (see 20260516000000_league_preview_anon.sql).
GRANT EXECUTE ON FUNCTION public.get_league_preview(text) TO anon;
