-- Practice-mode runs stored per user so the /me Stats hub can show the same
-- picture across devices once a user signs in. Mirrors the v4 StoredRun
-- shape from lib/use-local-history.ts; rolled-up analytics fields are stored
-- as jsonb so the read path stays a single-table fetch (no joins, no
-- server-side recomputation).
--
-- Competitive rounds (ranked/daily) already live in the `runs` table with
-- server-issued seeds + answer-key validation; this table is practice-only.

CREATE TABLE practice_runs (
  -- Client-generated UUID. The client controls the id so retry/idempotent
  -- upsert is trivial (ON CONFLICT (id) DO NOTHING). Also lets the local
  -- cache and the server row reference the same key.
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Practice modes only. v1 ships 'classic' and 'learn'; 'quant'/'compound'
  -- are reserved placeholders for v2 (matches PracticeMode in practice-stats.ts).
  mode text NOT NULL CHECK (mode IN ('classic', 'quant', 'compound', 'learn')),

  score int NOT NULL,
  problems_attempted int NOT NULL DEFAULT 0,
  problems_correct int NOT NULL DEFAULT 0,
  mean_latency_ms int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL,

  -- Round end time, set by client at saveRun() (matches StoredRun.endedAt).
  ended_at timestamptz NOT NULL,

  -- Pre-rolled-up analytics. Same shapes as ByOpStats / MulFactsStats /
  -- Record<string, TagStats> in lib/practice-stats.ts. Storing the rollup
  -- (not raw events) keeps each row ~1-2 KB and means /me Stats reads are
  -- one table scan with no recomputation.
  by_op jsonb NOT NULL DEFAULT '{}'::jsonb,
  mul_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_tag jsonb NOT NULL DEFAULT '{}'::jsonb,
  tag_version int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- The dominant read pattern on /me Stats is "last N rows for this user,
-- newest first" plus filter-by-mode. (user_id, ended_at DESC) covers both
-- the recent-runs list and the lifetime totals scan.
CREATE INDEX idx_practice_runs_user_ended
  ON practice_runs(user_id, ended_at DESC);

ALTER TABLE practice_runs ENABLE ROW LEVEL SECURITY;

-- Self-only access. Service-role client used by server routes bypasses RLS,
-- so the API can validate and insert without these policies in the way.
CREATE POLICY practice_runs_select_own ON practice_runs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY practice_runs_insert_own ON practice_runs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY practice_runs_delete_own ON practice_runs
  FOR DELETE USING (user_id = auth.uid());
