CREATE OR REPLACE FUNCTION public.get_ranked_leaderboard_stats(league_slug text DEFAULT NULL)
RETURNS TABLE(
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  rating          integer,
  peak_rating     integer,
  is_provisional  boolean,
  best_score      integer,
  best_started_at timestamptz,
  runs_played     integer,
  rounds_won      integer,
  average_score   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH requested_league AS (
    SELECT l.id
    FROM public.leagues l
    JOIN public.league_members lm ON lm.league_id = l.id
    WHERE l.slug = league_slug AND lm.user_id = (SELECT auth.uid())
  ),
  members AS (
    SELECT lm.user_id
    FROM public.league_members lm
    JOIN requested_league lg ON lg.id = lm.league_id
  ),
  ranked_runs AS (
    SELECT r.id, r.user_id, r.score, r.started_at
    FROM public.runs r
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND r.mode = 'ranked'
      AND r.validation_status = 'ok'
      AND r.score >= 0
      AND r.started_at <= now()
      AND r.completed_at BETWEEN r.started_at AND now()
      AND (league_slug IS NULL OR r.user_id IN (SELECT m.user_id FROM members m))
  ),
  players AS (
    SELECT rr.user_id FROM ranked_runs rr WHERE league_slug IS NULL AND rr.score >= 5
    UNION
    SELECT m.user_id FROM members m
  ),
  totals AS (
    SELECT rr.user_id, count(*)::int AS runs_played, round(avg(rr.score), 1) AS average_score
    FROM ranked_runs rr
    GROUP BY rr.user_id
  ),
  best_runs AS (
    SELECT DISTINCT ON (rr.user_id) rr.user_id, rr.score, rr.started_at
    FROM ranked_runs rr
    ORDER BY rr.user_id, rr.score DESC, rr.started_at ASC
  ),
  recorded_rounds AS (
    SELECT DISTINCT ON (re.run_id)
      re.run_id,
      rr.user_id,
      rr.score,
      re.opponent_count,
      CASE WHEN jsonb_typeof(re.details->'opponents') = 'array'
        THEN re.details->'opponents' ELSE '[]'::jsonb END AS opponents
    FROM public.rating_events re
    JOIN ranked_runs rr ON rr.id = re.run_id AND rr.user_id = re.user_id
    WHERE re.created_at <= now()
    ORDER BY re.run_id, re.created_at ASC, re.id ASC
  ),
  wins AS (
    SELECT recorded.user_id, count(*)::int AS rounds_won
    FROM recorded_rounds recorded
    WHERE jsonb_array_length(recorded.opponents) > 0
      AND recorded.opponent_count = jsonb_array_length(recorded.opponents)
      AND recorded.opponent_count = (
        SELECT count(DISTINCT lower(opponent.value->>'opp_id'))
        FROM jsonb_array_elements(recorded.opponents) AS opponent(value)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(recorded.opponents) AS opponent(value)
        WHERE NOT COALESCE(
          CASE WHEN jsonb_typeof(opponent.value->'my_score') = 'number'
                 AND jsonb_typeof(opponent.value->'opp_score') = 'number'
                 AND jsonb_typeof(opponent.value->'opp_id') = 'string'
            THEN (opponent.value->>'my_score')::numeric = recorded.score
              AND (opponent.value->>'opp_score')::numeric >= 0
              AND trunc((opponent.value->>'opp_score')::numeric) = (opponent.value->>'opp_score')::numeric
              AND (opponent.value->>'my_score')::numeric > (opponent.value->>'opp_score')::numeric
              AND (opponent.value->>'opp_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND lower(opponent.value->>'opp_id') <> recorded.user_id::text
            ELSE false
          END,
          false
        )
      )
    GROUP BY recorded.user_id
  )
  SELECT
    p.user_id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      'Player'
    ) AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(ur.rating, 1200) AS rating,
    COALESCE(ur.peak_rating, 1200) AS peak_rating,
    COALESCE(ur.matches_played, 0) < 30 AS is_provisional,
    COALESCE(br.score, 0) AS best_score,
    br.started_at AS best_started_at,
    COALESCE(t.runs_played, 0) AS runs_played,
    COALESCE(w.rounds_won, 0) AS rounds_won,
    COALESCE(t.average_score, 0)::numeric AS average_score
  FROM players p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.user_ratings ur ON ur.user_id = p.user_id
  LEFT JOIN totals t ON t.user_id = p.user_id
  LEFT JOIN best_runs br ON br.user_id = p.user_id
  LEFT JOIN wins w ON w.user_id = p.user_id
  ORDER BY rating DESC, best_score DESC, best_started_at ASC NULLS LAST, p.user_id ASC
  LIMIT CASE WHEN league_slug IS NULL THEN 100 ELSE 50 END;
$$;

REVOKE ALL ON FUNCTION public.get_ranked_leaderboard_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard_stats(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_daily_leaderboard_stats(league_slug text DEFAULT NULL)
RETURNS TABLE(
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  mean_duration_ms numeric,
  runs_completed   integer,
  runs_forfeited   integer,
  best_duration_ms integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH requested_league AS (
    SELECT l.id
    FROM public.leagues l
    JOIN public.league_members lm ON lm.league_id = l.id
    WHERE l.slug = league_slug AND lm.user_id = (SELECT auth.uid())
  ),
  members AS (
    SELECT lm.user_id
    FROM public.league_members lm
    JOIN requested_league lg ON lg.id = lm.league_id
  ),
  daily_runs AS (
    SELECT
      r.user_id,
      r.duration_ms,
      r.validation_status,
      r.validation_status = 'ok'
        AND r.score = 50
        AND r.problems_correct = 50
        AND r.duration_ms > 0
        AND r.completed_at BETWEEN r.started_at AND now() AS completed
    FROM public.runs r
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND r.mode = 'daily'
      AND r.validation_status IN ('ok', 'forfeited')
      AND r.started_at <= now()
      AND (r.completed_at IS NULL OR r.completed_at <= now())
      AND r.daily_date <= (now() AT TIME ZONE 'America/New_York')::date
      AND (league_slug IS NULL OR r.user_id IN (SELECT m.user_id FROM members m))
  ),
  totals AS (
    SELECT
      dr.user_id,
      round(avg(dr.duration_ms) FILTER (WHERE dr.completed), 0) AS mean_duration_ms,
      min(dr.duration_ms) FILTER (WHERE dr.completed) AS best_duration_ms,
      count(*) FILTER (WHERE dr.completed)::int AS runs_completed,
      count(*) FILTER (WHERE dr.validation_status = 'forfeited')::int AS runs_forfeited
    FROM daily_runs dr
    GROUP BY dr.user_id
  ),
  players AS (
    SELECT t.user_id FROM totals t WHERE league_slug IS NULL AND t.runs_completed > 0
    UNION
    SELECT m.user_id FROM members m
  )
  SELECT
    p.user_id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      'Player'
    ) AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(t.mean_duration_ms, 0)::numeric AS mean_duration_ms,
    COALESCE(t.runs_completed, 0) AS runs_completed,
    COALESCE(t.runs_forfeited, 0) AS runs_forfeited,
    COALESCE(t.best_duration_ms, 0) AS best_duration_ms
  FROM players p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN totals t ON t.user_id = p.user_id
  ORDER BY
    CASE WHEN t.runs_completed > 0 THEN 0 ELSE 1 END,
    t.mean_duration_ms ASC NULLS LAST,
    t.runs_completed DESC NULLS LAST,
    p.user_id ASC
  LIMIT CASE WHEN league_slug IS NULL THEN 100 ELSE 50 END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_leaderboard_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_leaderboard_stats(text) TO authenticated, service_role;
