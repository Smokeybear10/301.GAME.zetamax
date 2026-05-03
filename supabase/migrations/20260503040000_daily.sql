-- Zetamax v1 — Daily mode
--
-- Adds mode + daily_date columns to runs, a 'forfeited' validation status,
-- a partial unique index that enforces one daily attempt per (user, day),
-- a daily-specific leaderboard RPC, and updates the existing ranked
-- leaderboard + apply_run_elo to ignore daily runs (no daily ELO).
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- runs: new columns + constraints
-- ============================================================================
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ranked',
  ADD COLUMN IF NOT EXISTS daily_date date;

-- Replace the validation_status CHECK to include 'forfeited'.
ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_validation_status_check;
ALTER TABLE public.runs
  ADD CONSTRAINT runs_validation_status_check CHECK (
    validation_status IN (
      'pending', 'ok', 'abandoned', 'forfeited',
      'rejected_score_mismatch', 'rejected_latency',
      'rejected_wallclock', 'rejected_streak'
    )
  );

-- mode is constrained to a small set; CHECK keeps stray values out.
ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_mode_check;
ALTER TABLE public.runs
  ADD CONSTRAINT runs_mode_check CHECK (mode IN ('ranked', 'daily'));

-- One row per (user, daily_date) for daily-mode runs.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_runs_daily_user_date
  ON public.runs (user_id, daily_date)
  WHERE mode = 'daily';

-- Lookup helper for the per-user daily history page.
CREATE INDEX IF NOT EXISTS idx_runs_user_daily
  ON public.runs (user_id, daily_date DESC)
  WHERE mode = 'daily';

-- ============================================================================
-- get_league_leaderboard: now filters mode='ranked' so daily runs don't
-- pollute the ranked board. Otherwise unchanged.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_league_leaderboard(text);

CREATE OR REPLACE FUNCTION public.get_league_leaderboard(league_slug text)
RETURNS TABLE(
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  rating          integer,
  peak_rating     integer,
  is_provisional  boolean,
  best_score      integer,
  best_started_at timestamptz,
  runs_played     integer
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
  qualifying_runs AS (
    SELECT r.user_id, r.score, r.started_at
    FROM public.runs r
    WHERE r.user_id IN (SELECT user_id FROM members)
      AND r.mode = 'ranked'
      AND r.validation_status = 'ok'
      AND r.score >= 5
      AND r.started_at >= now() - interval '30 days'
  ),
  best_runs AS (
    SELECT DISTINCT ON (qr.user_id)
      qr.user_id,
      qr.score      AS best_score,
      qr.started_at AS best_started_at
    FROM qualifying_runs qr
    ORDER BY qr.user_id, qr.score DESC, qr.started_at ASC
  ),
  counts AS (
    SELECT qr.user_id, count(*)::int AS n
    FROM qualifying_runs qr
    GROUP BY qr.user_id
  )
  SELECT
    m.user_id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      split_part(u.email, '@', 1)
    )                                  AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(ur.rating, 1500)           AS rating,
    COALESCE(ur.peak_rating, 1500)      AS peak_rating,
    COALESCE(ur.matches_played, 0) < 30 AS is_provisional,
    COALESCE(br.best_score, 0)          AS best_score,
    br.best_started_at,
    COALESCE(c.n, 0)                    AS runs_played
  FROM members m
  JOIN auth.users u                ON u.id = m.user_id
  LEFT JOIN public.user_ratings ur ON ur.user_id = m.user_id
  LEFT JOIN best_runs br            ON br.user_id = m.user_id
  LEFT JOIN counts c                ON c.user_id = m.user_id
  ORDER BY
    rating DESC,
    best_score DESC,
    best_started_at ASC NULLS LAST
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_leaderboard(text) TO authenticated;

-- ============================================================================
-- get_league_daily_leaderboard: per-league mean + runs_completed over the
-- last 30 days of daily runs. Forfeited rows are EXCLUDED from both metrics
-- (per design — "the penalty doesn't count as a 0").
--
-- Sort: mean_score DESC, runs_completed DESC, alphabetical name as final
-- tie-break. Members with no completed daily rounds appear at the bottom.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_league_daily_leaderboard(text);

CREATE OR REPLACE FUNCTION public.get_league_daily_leaderboard(league_slug text)
RETURNS TABLE(
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  mean_score      numeric,
  runs_completed  integer,
  runs_forfeited  integer
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
    SELECT r.user_id, r.score, r.validation_status, r.daily_date
    FROM public.runs r
    WHERE r.user_id IN (SELECT user_id FROM members)
      AND r.mode = 'daily'
      AND r.daily_date >= (current_date - interval '30 days')
  ),
  ok_runs AS (
    SELECT user_id, score
    FROM daily_runs
    WHERE validation_status = 'ok'
  ),
  agg AS (
    SELECT
      member.user_id,
      ROUND(AVG(ok.score)::numeric, 1)                            AS mean_score,
      COUNT(ok.score)::int                                        AS runs_completed,
      COUNT(*) FILTER (WHERE dr.validation_status = 'forfeited')::int AS runs_forfeited
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
    )                                  AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(a.mean_score, 0)::numeric AS mean_score,
    COALESCE(a.runs_completed, 0)      AS runs_completed,
    COALESCE(a.runs_forfeited, 0)      AS runs_forfeited
  FROM agg a
  JOIN auth.users u ON u.id = a.user_id
  ORDER BY
    a.mean_score DESC NULLS LAST,
    a.runs_completed DESC,
    display_name ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_daily_leaderboard(text) TO authenticated;

-- ============================================================================
-- get_my_daily_summary: small RPC for the /me Daily block.
-- Returns 30-day mean + completed + forfeited counts for the caller.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_my_daily_summary();

CREATE OR REPLACE FUNCTION public.get_my_daily_summary()
RETURNS TABLE(
  mean_score     numeric,
  runs_completed integer,
  runs_forfeited integer,
  played_today   boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_runs AS (
    SELECT score, validation_status, daily_date
    FROM public.runs
    WHERE user_id = auth.uid()
      AND mode = 'daily'
      AND daily_date >= (current_date - interval '30 days')
  )
  SELECT
    COALESCE(ROUND(AVG(score) FILTER (WHERE validation_status = 'ok')::numeric, 1), 0)::numeric AS mean_score,
    COUNT(*) FILTER (WHERE validation_status = 'ok')::int                                       AS runs_completed,
    COUNT(*) FILTER (WHERE validation_status = 'forfeited')::int                                AS runs_forfeited,
    EXISTS (SELECT 1 FROM window_runs WHERE daily_date = current_date)                          AS played_today
  FROM window_runs;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_daily_summary() TO authenticated;

-- ============================================================================
-- apply_run_elo: bail early when run.mode != 'ranked'. Daily runs do not
-- move ELO. Body is otherwise unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.apply_run_elo(p_run_id uuid)
RETURNS TABLE(
  delta          integer,
  new_rating     integer,
  opponent_count integer,
  is_provisional boolean,
  breakdown      jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_runner_id        uuid;
  v_runner_score     integer;
  v_runner_started   timestamptz;
  v_runner_status    text;
  v_runner_mode      text;
  v_today            date;
  v_runner_rating    integer;
  v_runner_matches   integer;
  v_old_rating       integer;
  v_provisional      boolean;
  v_k_base           integer;
  v_n                integer;
  v_k_per_op         numeric;
  v_total_delta_int  integer := 0;
  v_breakdown        jsonb   := '[]'::jsonb;
  v_opp              record;
  v_expected         numeric;
  v_actual           numeric;
  v_opp_delta        numeric;
  v_opp_delta_int    integer;
  v_new_rating       integer;
BEGIN
  SELECT r.user_id, r.score, r.started_at, r.validation_status, r.mode
    INTO v_runner_id, v_runner_score, v_runner_started, v_runner_status, v_runner_mode
  FROM public.runs r
  WHERE r.id = p_run_id;

  -- No-op if not found, not validated, low score, or non-ranked mode
  IF NOT FOUND
     OR v_runner_status <> 'ok'
     OR COALESCE(v_runner_score, 0) < 5
     OR v_runner_mode <> 'ranked'
  THEN
    SELECT COALESCE(rating, 1500), COALESCE(matches_played, 0) < 30
      INTO v_runner_rating, v_provisional
    FROM public.user_ratings
    WHERE user_id = v_runner_id;
    RETURN QUERY SELECT
      0,
      COALESCE(v_runner_rating, 1500),
      0,
      COALESCE(v_provisional, true),
      '[]'::jsonb;
    RETURN;
  END IF;

  v_today := (v_runner_started AT TIME ZONE 'America/New_York')::date;

  INSERT INTO public.user_ratings (user_id)
  VALUES (v_runner_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, matches_played
    INTO v_runner_rating, v_runner_matches
  FROM public.user_ratings
  WHERE user_id = v_runner_id;

  v_old_rating  := v_runner_rating;
  v_provisional := v_runner_matches < 30;
  v_k_base      := CASE WHEN v_provisional THEN 32 ELSE 16 END;

  SELECT count(DISTINCT mate.user_id)::int
    INTO v_n
  FROM public.league_members me
  JOIN public.league_members mate ON mate.league_id = me.league_id
  JOIN public.runs opp_runs       ON opp_runs.user_id = mate.user_id
  WHERE me.user_id = v_runner_id
    AND mate.user_id <> v_runner_id
    AND opp_runs.mode = 'ranked'
    AND opp_runs.validation_status = 'ok'
    AND opp_runs.score >= 5
    AND (opp_runs.started_at AT TIME ZONE 'America/New_York')::date = v_today;

  IF v_n = 0 THEN
    UPDATE public.user_ratings
    SET last_match_at = now(),
        updated_at    = now()
    WHERE user_id = v_runner_id;

    INSERT INTO public.rating_events
      (user_id, run_id, delta, opponent_count, before_rating, after_rating, details)
    VALUES
      (v_runner_id, p_run_id, 0, 0, v_old_rating, v_old_rating,
       jsonb_build_object('opponents', '[]'::jsonb, 'reason', 'no_opponents_today'));

    RETURN QUERY SELECT 0, v_old_rating, 0, v_provisional, '[]'::jsonb;
    RETURN;
  END IF;

  v_k_per_op := v_k_base::numeric / v_n::numeric;

  FOR v_opp IN
    SELECT
      mate.user_id                          AS opp_id,
      MAX(opp_runs.score)                   AS opp_score,
      COALESCE(MAX(ur.rating), 1500)        AS opp_rating,
      COALESCE(
        NULLIF(trim(MAX(u.raw_user_meta_data->>'display_name')), ''),
        NULLIF(trim(MAX(u.raw_user_meta_data->>'name')), ''),
        NULLIF(trim(MAX(u.raw_user_meta_data->>'full_name')), ''),
        split_part(MAX(u.email), '@', 1)
      )                                     AS opp_name
    FROM public.league_members me
    JOIN public.league_members mate ON mate.league_id = me.league_id
    JOIN public.runs opp_runs       ON opp_runs.user_id = mate.user_id
    JOIN auth.users u               ON u.id = mate.user_id
    LEFT JOIN public.user_ratings ur ON ur.user_id = mate.user_id
    WHERE me.user_id = v_runner_id
      AND mate.user_id <> v_runner_id
      AND opp_runs.mode = 'ranked'
      AND opp_runs.validation_status = 'ok'
      AND opp_runs.score >= 5
      AND (opp_runs.started_at AT TIME ZONE 'America/New_York')::date = v_today
    GROUP BY mate.user_id
  LOOP
    v_expected := 1.0 / (1.0 + power(10.0::numeric, (v_opp.opp_rating - v_runner_rating)::numeric / 400.0));
    v_actual   := 0.5 + 0.5 * tanh((v_runner_score - v_opp.opp_score)::numeric / 10.0);
    v_opp_delta     := v_k_per_op * (v_actual - v_expected);
    v_opp_delta_int := round(v_opp_delta)::int;
    v_total_delta_int := v_total_delta_int + v_opp_delta_int;

    v_breakdown := v_breakdown || jsonb_build_object(
      'opp_id',    v_opp.opp_id,
      'opp_name',  v_opp.opp_name,
      'opp_score', v_opp.opp_score,
      'my_score',  v_runner_score,
      'delta',     v_opp_delta_int
    );
  END LOOP;

  v_new_rating := GREATEST(1000, v_old_rating + v_total_delta_int);

  UPDATE public.user_ratings
  SET rating         = v_new_rating,
      peak_rating    = GREATEST(peak_rating, v_new_rating),
      matches_played = matches_played + 1,
      last_match_at  = now(),
      updated_at     = now()
  WHERE user_id = v_runner_id;

  INSERT INTO public.rating_events
    (user_id, run_id, delta, opponent_count, before_rating, after_rating, details)
  VALUES
    (v_runner_id, p_run_id, v_new_rating - v_old_rating, v_n,
     v_old_rating, v_new_rating,
     jsonb_build_object('opponents', v_breakdown));

  RETURN QUERY SELECT
    v_new_rating - v_old_rating,
    v_new_rating,
    v_n,
    v_provisional,
    v_breakdown;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_run_elo(uuid) TO authenticated;

-- ============================================================================
-- mark_abandoned_runs: extended to also flip stale daily pendings to
-- 'forfeited' (not 'abandoned') so we can analytically distinguish a network
-- drop (ranked, abandoned) from a deliberate reload (daily, forfeited).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_abandoned_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  abandoned_count integer;
  forfeited_count integer;
BEGIN
  UPDATE public.runs
  SET validation_status = 'abandoned',
      completed_at      = now()
  WHERE validation_status = 'pending'
    AND mode = 'ranked'
    AND started_at < now() - interval '125 seconds';
  GET DIAGNOSTICS abandoned_count = ROW_COUNT;

  UPDATE public.runs
  SET validation_status = 'forfeited',
      completed_at      = now()
  WHERE validation_status = 'pending'
    AND mode = 'daily'
    AND started_at < now() - interval '130 seconds';
  GET DIAGNOSTICS forfeited_count = ROW_COUNT;

  RETURN abandoned_count + forfeited_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_abandoned_runs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_abandoned_runs() FROM anon, authenticated;

-- Add a more frequent cron schedule for the daily forfeit sweep — every 5 min.
-- The nightly job from the prior migration still runs (idempotent OK).
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid
  FROM cron.job
  WHERE jobname = 'mark-abandoned-runs-frequent';

  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'mark-abandoned-runs-frequent',
    '*/5 * * * *',
    $cron$SELECT public.mark_abandoned_runs();$cron$
  );
END $$;
