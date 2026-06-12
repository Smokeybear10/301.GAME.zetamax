-- ============================================================================
-- ELO rebaseline: shift the system anchor from 1200 to 800.
--
-- - New players start at 800 (was 1200).
-- - Existing players shift down by 400 (clamped at the new floor 400),
--   preserving relative ordering. A player at 1247 becomes 847.
-- - Expected-score curve re-anchors so 800 = expected score 35.
-- - Rating floor drops from 800 to 400 (keeps the 400-point anchor→floor gap).
-- - Leaderboard COALESCE fallbacks update from 1200 to 800.
--
-- SECURITY: the 20260529 hardening migration revoked apply_run_elo from
-- anon/authenticated (only the service-role API route may call it). This
-- migration uses CREATE OR REPLACE with the IDENTICAL signature, which
-- PRESERVES the existing grants — it does NOT re-add a grant to authenticated.
-- A defensive REVOKE at the end guarantees the lockdown survives regardless.
-- Idempotent.
-- ============================================================================

-- 1. Column defaults
ALTER TABLE public.user_ratings
  ALTER COLUMN rating      SET DEFAULT 800;

ALTER TABLE public.user_ratings
  ALTER COLUMN peak_rating SET DEFAULT 800;

-- 2. Backfill existing rows: shift everyone down 400, clamped at the new floor.
--    peak stays >= rating since both shift by the same amount and clamp alike.
UPDATE public.user_ratings
SET rating      = GREATEST(400, rating - 400),
    peak_rating = GREATEST(400, peak_rating - 400);

-- ============================================================================
-- 3. apply_run_elo — re-anchor to 800, floor 400. Math is identical to the
--    1200 version; only the anchor (1200→800) and floor (800→400) constants
--    change. CREATE OR REPLACE (not DROP) so the service-role-only grants from
--    the security migration are preserved.
-- ============================================================================
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

  IF NOT FOUND
     OR v_runner_status <> 'ok'
     OR COALESCE(v_runner_score, 0) < 5
     OR v_runner_mode <> 'ranked'
  THEN
    SELECT COALESCE(rating, 800), COALESCE(matches_played, 0) < 30
      INTO v_runner_rating, v_provisional
    FROM public.user_ratings
    WHERE user_id = v_runner_id;
    RETURN QUERY SELECT
      0,
      COALESCE(v_runner_rating, 800),
      0,
      COALESCE(v_provisional, true),
      '[]'::jsonb,
      0,
      GREATEST(0, 35 + (COALESCE(v_runner_rating, 800) - 800) / 25);
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

  -- Baseline delta — anchored at 800 = expected score 35.
  v_expected_score := GREATEST(0, 35 + (v_runner_rating - 800) / 25);
  v_baseline_delta := round(
    v_k_base::numeric * tanh((v_runner_score - v_expected_score)::numeric / 10.0)
  )::int;

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
        COALESCE(MAX(ur.rating), 800)         AS opp_rating,
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

  -- Rating floor: 400 (keeps the 400-point gap below the 800 anchor).
  v_total_delta_int := v_race_delta_int + v_baseline_delta;
  v_new_rating      := GREATEST(400, v_old_rating + v_total_delta_int);

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

-- Belt-and-suspenders: preserve the 20260529 hardening. CREATE OR REPLACE
-- keeps existing grants, but re-assert that only the service role may call this.
REVOKE EXECUTE ON FUNCTION public.apply_run_elo(uuid) FROM anon, authenticated, PUBLIC;

-- ============================================================================
-- 4. get_league_leaderboard — re-anchor COALESCE fallbacks 1200 → 800.
--    CREATE OR REPLACE preserves grants; this RPC is legitimately callable by
--    authenticated (it powers the leaderboard UI), so its grant is re-asserted.
-- ============================================================================
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
    COALESCE(ur.rating, 800)            AS rating,
    COALESCE(ur.peak_rating, 800)       AS peak_rating,
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
