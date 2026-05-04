-- ============================================================================
-- ELO v2 — Hybrid race + baseline.
--
-- Always-on per-round movement: every validated Ranked round produces both
-- a race delta (vs same-day league mates, current logic) and a baseline
-- delta (vs an expected score derived from current rating). Both are summed.
--
-- Math:
--   expected_score = 35 + (rating - 1500) / 25                    (floor 0)
--   baseline_delta = round(K_base * tanh((score - expected) / 10))
--   K_base         = 8 (provisional) | 4 (rated)
--
-- Race math is unchanged. Net changes vs the previous apply_run_elo:
--   1. matches_played increments on every valid round (not just when n > 0)
--   2. baseline_delta is always added to the total
--   3. RETURNS gains baseline_delta + expected_score (additive)
--   4. rating_events.details JSON gains baseline_delta + expected_score + race_delta
--   5. Solo-play (no opponents) no longer short-circuits — it produces a
--      real baseline movement and updates rating + matches_played
-- ============================================================================
DROP FUNCTION IF EXISTS public.apply_run_elo(uuid);

CREATE OR REPLACE FUNCTION public.apply_run_elo(p_run_id uuid)
RETURNS TABLE(
  delta           integer,
  new_rating      integer,
  opponent_count  integer,
  is_provisional  boolean,
  breakdown       jsonb,
  baseline_delta  integer,
  expected_score  integer
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
  v_k_race           integer;
  v_k_base           integer;
  v_n                integer;
  v_k_per_op         numeric;
  v_race_delta_int   integer := 0;
  v_baseline_delta   integer := 0;
  v_expected_score   integer;
  v_total_delta_int  integer;
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

  -- No-op if not found, not validated, low score, or non-ranked mode.
  -- Score < 5 sandbag protection still applies — solo grinding requires real play.
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
      '[]'::jsonb,
      0,
      GREATEST(0, 35 + (COALESCE(v_runner_rating, 1500) - 1500) / 25);
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
  v_k_race      := CASE WHEN v_provisional THEN 32 ELSE 16 END;
  v_k_base      := CASE WHEN v_provisional THEN 8  ELSE 4  END;

  -- Baseline delta — always computed, always applied.
  v_expected_score := GREATEST(0, 35 + (v_runner_rating - 1500) / 25);
  v_baseline_delta := round(
    v_k_base::numeric * tanh((v_runner_score - v_expected_score)::numeric / 10.0)
  )::int;

  -- Race opponents — same-day league mates with a validated ranked round.
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

  IF v_n > 0 THEN
    v_k_per_op := v_k_race::numeric / v_n::numeric;

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
      v_race_delta_int := v_race_delta_int + v_opp_delta_int;

      v_breakdown := v_breakdown || jsonb_build_object(
        'opp_id',    v_opp.opp_id,
        'opp_name',  v_opp.opp_name,
        'opp_score', v_opp.opp_score,
        'my_score',  v_runner_score,
        'delta',     v_opp_delta_int
      );
    END LOOP;
  END IF;

  -- Combine race + baseline. Rating floored at 1000 so a meltdown can't
  -- send you to negative ELO.
  v_total_delta_int := v_race_delta_int + v_baseline_delta;
  v_new_rating      := GREATEST(1000, v_old_rating + v_total_delta_int);

  -- Always update — solo grinding now counts toward matches_played, which
  -- means provisional countdown actually counts down without league mates.
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
     jsonb_build_object(
       'opponents',      v_breakdown,
       'baseline_delta', v_baseline_delta,
       'expected_score', v_expected_score,
       'race_delta',     v_race_delta_int
     ));

  RETURN QUERY SELECT
    v_new_rating - v_old_rating,
    v_new_rating,
    v_n,
    v_provisional,
    v_breakdown,
    v_baseline_delta,
    v_expected_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_run_elo(uuid) TO authenticated;
