DROP POLICY IF EXISTS runs_insert_own ON public.runs;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.runs FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_runs_global_ranked
  ON public.runs (user_id, score DESC, started_at ASC)
  WHERE mode = 'ranked' AND validation_status = 'ok' AND score >= 5;

CREATE INDEX IF NOT EXISTS idx_runs_global_daily
  ON public.runs (daily_date, user_id)
  INCLUDE (duration_ms, validation_status, score, problems_correct)
  WHERE mode = 'daily' AND validation_status IN ('ok', 'forfeited');

CREATE OR REPLACE FUNCTION public.get_global_ranked_leaderboard()
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
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH qualifying_runs AS (
    SELECT r.user_id, r.score, r.started_at
    FROM public.runs r
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND r.mode = 'ranked'
      AND r.validation_status = 'ok'
      AND r.score >= 5
      AND r.started_at <= now()
  ),
  best_runs AS (
    SELECT DISTINCT ON (qr.user_id)
      qr.user_id,
      qr.score AS best_score,
      qr.started_at AS best_started_at
    FROM qualifying_runs qr
    ORDER BY qr.user_id, qr.score DESC, qr.started_at ASC
  ),
  counts AS (
    SELECT qr.user_id, count(*)::int AS runs_played
    FROM qualifying_runs qr
    GROUP BY qr.user_id
  )
  SELECT
    br.user_id,
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
    br.best_score,
    br.best_started_at,
    c.runs_played
  FROM best_runs br
  JOIN counts c ON c.user_id = br.user_id
  JOIN auth.users u ON u.id = br.user_id
  LEFT JOIN public.user_ratings ur ON ur.user_id = br.user_id
  ORDER BY rating DESC, br.best_score DESC, br.best_started_at ASC, br.user_id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_global_ranked_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_global_ranked_leaderboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_global_daily_leaderboard()
RETURNS TABLE(
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  mean_duration_ms numeric,
  runs_completed   integer,
  runs_forfeited   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH daily_runs AS (
    SELECT
      r.user_id,
      r.duration_ms,
      r.validation_status,
      r.validation_status = 'ok'
        AND r.score = 50
        AND r.problems_correct = 50
        AND r.duration_ms > 0 AS completed
    FROM public.runs r
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND r.mode = 'daily'
      AND r.validation_status IN ('ok', 'forfeited')
      AND r.daily_date BETWEEN (now() AT TIME ZONE 'America/New_York')::date - 29
                           AND (now() AT TIME ZONE 'America/New_York')::date
  ),
  totals AS (
    SELECT
      dr.user_id,
      ROUND(AVG(dr.duration_ms) FILTER (WHERE dr.completed), 0) AS mean_duration_ms,
      COUNT(*) FILTER (WHERE dr.completed)::int AS runs_completed,
      COUNT(*) FILTER (WHERE dr.validation_status = 'forfeited')::int AS runs_forfeited
    FROM daily_runs dr
    GROUP BY dr.user_id
    HAVING COUNT(*) FILTER (WHERE dr.completed) > 0
  )
  SELECT
    t.user_id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      'Player'
    ) AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    t.mean_duration_ms,
    t.runs_completed,
    t.runs_forfeited
  FROM totals t
  JOIN auth.users u ON u.id = t.user_id
  ORDER BY t.mean_duration_ms ASC, t.runs_completed DESC, t.user_id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_global_daily_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_global_daily_leaderboard() TO authenticated, service_role;
