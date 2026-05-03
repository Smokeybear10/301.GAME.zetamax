-- Zetamax v1 — initial schema
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- Idempotent: safe to re-run.

-- ============================================================================
-- runs: every drill round, server-validated and stored.
-- answer_key is server-only — never returned to the client.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed text NOT NULL,
  answer_key jsonb NOT NULL,
  -- server-populated at /api/runs/finish
  score integer,
  problems_attempted integer,
  problems_correct integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN (
      'pending', 'ok', 'abandoned',
      'rejected_score_mismatch', 'rejected_latency',
      'rejected_wallclock', 'rejected_streak'
    )),
  client_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user history lookup (lifetime best, /me page in v2).
CREATE INDEX IF NOT EXISTS idx_runs_user_started_at
  ON public.runs (user_id, started_at DESC);

-- Partial index for the daily leaderboard query — only valid scoring runs.
CREATE INDEX IF NOT EXISTS idx_runs_leaderboard
  ON public.runs (started_at, score DESC)
  WHERE validation_status = 'ok' AND score >= 5;

-- ============================================================================
-- friendships: canonical pairs (user_low < user_high) — one row per friendship.
-- App code MUST sort the pair before INSERT.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.friendships (
  user_low uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted')),  -- v2 will add 'pending' / 'blocked'
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_via_token text,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);

-- ============================================================================
-- invite_tokens: single-use, 7-day expiry.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invite_tokens (
  token text PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz
);

-- ============================================================================
-- RLS — defense-in-depth. Most writes go through service-role route handlers
-- (which bypass RLS), but the policies below catch any client-direct access.
-- ============================================================================
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- runs: users read ONLY their own directly. Friend reads go through the RPC.
DROP POLICY IF EXISTS runs_select_own ON public.runs;
CREATE POLICY runs_select_own ON public.runs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS runs_insert_own ON public.runs;
CREATE POLICY runs_insert_own ON public.runs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- friendships: participants only.
DROP POLICY IF EXISTS friendships_select_participant ON public.friendships;
CREATE POLICY friendships_select_participant ON public.friendships
  FOR SELECT USING (user_low = auth.uid() OR user_high = auth.uid());

DROP POLICY IF EXISTS friendships_insert_participant ON public.friendships;
CREATE POLICY friendships_insert_participant ON public.friendships
  FOR INSERT WITH CHECK (user_low = auth.uid() OR user_high = auth.uid());

-- invite_tokens: inviter reads/inserts their own. Redemption is service-role only.
DROP POLICY IF EXISTS invite_tokens_select_inviter ON public.invite_tokens;
CREATE POLICY invite_tokens_select_inviter ON public.invite_tokens
  FOR SELECT USING (inviter_id = auth.uid());

DROP POLICY IF EXISTS invite_tokens_insert_inviter ON public.invite_tokens;
CREATE POLICY invite_tokens_insert_inviter ON public.invite_tokens
  FOR INSERT WITH CHECK (inviter_id = auth.uid());

-- ============================================================================
-- get_friend_leaderboard(day): one row per friend (and the viewer themselves),
-- with their best score for the given day in America/New_York. Uses the
-- viewer's auth.uid() — no need to pass it explicitly.
--
-- SECURITY DEFINER bypasses RLS so we can read any user's runs IF they're a
-- friend. The friendship check below enforces that.
--
-- Tie-breaker: earliest started_at wins (first to reach the score that day).
-- Score floor: 5 (hides accidental opens from leaderboard pollution).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_friend_leaderboard(day date)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  best_score integer,
  best_started_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friend_ids AS (
    SELECT CASE WHEN user_low = auth.uid() THEN user_high ELSE user_low END AS fid
    FROM public.friendships
    WHERE (user_low = auth.uid() OR user_high = auth.uid())
      AND status = 'accepted'
    UNION
    SELECT auth.uid()
  ),
  best_runs AS (
    SELECT DISTINCT ON (r.user_id)
      r.user_id,
      r.score AS best_score,
      r.started_at AS best_started_at
    FROM public.runs r
    WHERE r.user_id IN (SELECT fid FROM friend_ids)
      AND r.validation_status = 'ok'
      AND r.score >= 5
      AND (r.started_at AT TIME ZONE 'America/New_York')::date = day
    ORDER BY r.user_id, r.score DESC, r.started_at ASC
  )
  SELECT
    br.user_id,
    COALESCE(
      u.raw_user_meta_data->>'name',
      u.raw_user_meta_data->>'full_name',
      split_part(u.email, '@', 1)
    ) AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    br.best_score,
    br.best_started_at
  FROM best_runs br
  JOIN auth.users u ON u.id = br.user_id
  ORDER BY br.best_score DESC, br.best_started_at ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard(date) TO authenticated;
