-- ============================================================================
-- Daily v2: from "score in 2 minutes" to "answer 50 fixed questions, fastest wins."
--
-- - Round ends when 50th correct commits OR a 5-minute hard cap fires.
-- - Skip key disabled — must answer correctly to advance.
-- - Leaderboard ranks by mean DURATION over last 30 days (lowest = best).
-- - Existing daily rows were scored under the old metric and don't translate.
--   Hobby project, single user → wipe and start clean.
-- ============================================================================

-- 1. Wipe legacy daily runs. Old metric (score in 2min) is incompatible
--    with the new metric (time to 50). Forfeit rows would be misleading too.
DELETE FROM public.runs WHERE mode = 'daily';

-- 2. get_league_daily_leaderboard — mean_duration_ms ASC (faster wins).
--    Forfeits still excluded from the mean. Sort tie-break: more runs wins,
--    then alphabetical name.
DROP FUNCTION IF EXISTS public.get_league_daily_leaderboard(text);

CREATE OR REPLACE FUNCTION public.get_league_daily_leaderboard(league_slug text)
RETURNS TABLE(
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  mean_duration_ms numeric,
  runs_completed   integer,
  runs_forfeited   integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH lg AS (
    SELECT l.id
    FROM public.leagues l
    JOIN public.league_members lm ON lm.league_id = l.id
    WHERE l.slug = league_slug
      AND lm.user_id = auth.uid()
    LIMIT 1
  ),
  members AS (
    SELECT lm.user_id
    FROM public.league_members lm
    JOIN lg ON lg.id = lm.league_id
  ),
  daily_runs AS (
    SELECT r.user_id, r.duration_ms, r.validation_status, r.daily_date
    FROM public.runs r
    WHERE r.user_id IN (SELECT user_id FROM members)
      AND r.mode = 'daily'
      AND r.daily_date >= (current_date - interval '30 days')
  ),
  ok_runs AS (
    SELECT user_id, duration_ms
    FROM daily_runs
    WHERE validation_status = 'ok'
  ),
  agg AS (
    SELECT
      member.user_id,
      ROUND(AVG(ok.duration_ms)::numeric, 0)                              AS mean_duration_ms,
      COUNT(ok.duration_ms)::int                                          AS runs_completed,
      COUNT(*) FILTER (WHERE dr.validation_status = 'forfeited')::int     AS runs_forfeited
    FROM members member
    LEFT JOIN daily_runs dr ON dr.user_id = member.user_id
    LEFT JOIN ok_runs   ok  ON ok.user_id = member.user_id
    GROUP BY member.user_id
  )
  SELECT
    a.user_id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      split_part(u.email, '@', 1)
    )                                       AS display_name,
    u.raw_user_meta_data->>'avatar_url'     AS avatar_url,
    COALESCE(a.mean_duration_ms, 0)::numeric AS mean_duration_ms,
    COALESCE(a.runs_completed, 0)           AS runs_completed,
    COALESCE(a.runs_forfeited, 0)           AS runs_forfeited
  FROM agg a
  JOIN auth.users u ON u.id = a.user_id
  ORDER BY
    CASE WHEN a.runs_completed > 0 THEN 0 ELSE 1 END,  -- non-completers last
    a.mean_duration_ms ASC NULLS LAST,
    a.runs_completed DESC,
    display_name ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_daily_leaderboard(text) TO authenticated;

-- 3. get_my_daily_summary — same shape change. /me reads from this RPC.
DROP FUNCTION IF EXISTS public.get_my_daily_summary();

CREATE OR REPLACE FUNCTION public.get_my_daily_summary()
RETURNS TABLE(
  mean_duration_ms numeric,
  runs_completed   integer,
  runs_forfeited   integer,
  played_today     boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_runs AS (
    SELECT duration_ms, validation_status, daily_date
    FROM public.runs
    WHERE user_id = auth.uid()
      AND mode = 'daily'
      AND daily_date >= (current_date - interval '30 days')
  )
  SELECT
    COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE validation_status = 'ok')::numeric, 0), 0)::numeric AS mean_duration_ms,
    COUNT(*) FILTER (WHERE validation_status = 'ok')::int                                              AS runs_completed,
    COUNT(*) FILTER (WHERE validation_status = 'forfeited')::int                                       AS runs_forfeited,
    EXISTS (SELECT 1 FROM window_runs WHERE daily_date = current_date)                                 AS played_today
  FROM window_runs;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_daily_summary() TO authenticated;
