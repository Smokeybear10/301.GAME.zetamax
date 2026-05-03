-- Zetamax v1 — user-settable display name on leaderboards
-- The display name shown to friends now prefers a custom value the user can
-- set via supabase.auth.updateUser({ data: { display_name } }), falling back
-- to the OAuth-provided name fields. No new tables — Supabase Auth's
-- raw_user_meta_data already holds user-mutable JSON.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- get_league_leaderboard: same shape, new COALESCE order on display_name.
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
-- apply_run_elo: same logic, new COALESCE for opponent display name in the
-- breakdown JSON.
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
  SELECT r.user_id, r.score, r.started_at, r.validation_status
    INTO v_runner_id, v_runner_score, v_runner_started, v_runner_status
  FROM public.runs r
  WHERE r.id = p_run_id;

  IF NOT FOUND OR v_runner_status <> 'ok' OR COALESCE(v_runner_score, 0) < 5 THEN
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
