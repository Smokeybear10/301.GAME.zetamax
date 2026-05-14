/**
 * Pure aggregation functions for practice-mode analytics.
 *
 * Two layers:
 *   1. rollupRun: per-round, called at save time. Walks events, regenerates
 *      problems from the seed (cheap), and produces a `byOp` and `mulFacts`
 *      summary that gets persisted alongside the run.
 *   2. summarize* / lastNScores / lifetimeTotals: read-time aggregations
 *      across the persisted history array. Each is O(rows) and additive over
 *      the {n, correct, sumLatencyMs} triples.
 *
 * No localStorage, no React. Easy to unit-test. Imported by the storage
 * layer and the stats screen.
 */

import {
  generateProblem,
  hashString,
  type AnswerEvent,
  type GeneratorConfig,
  type Op,
  type RoundResult,
} from "@/lib/drill";
import { TAG_VERSION } from "@/lib/drill/derive-tags";
import {
  emptyTagStats,
  rollupTagsFromRound,
  type TagStats,
} from "@/lib/drill/round-analytics";

// 2..12 inclusive — the small-fact range that the heatmap covers.
export const MUL_FACT_MIN = 2;
export const MUL_FACT_MAX = 12;

/**
 * Practice modes. v1 ships only "classic"; the others are placeholders so
 * /practice/stats can filter or tab by mode without a schema bump when they
 * actually arrive.
 */
export type PracticeMode = "classic" | "quant" | "compound" | "learn";

/**
 * The full set of modes a stored row may carry. Practice modes plus the two
 * server-mirrored competitive modes that also save locally for the
 * diagnostic engine to aggregate across.
 */
export type SaveMode = PracticeMode | "ranked" | "daily";

/** Filter values for the `/me` Patterns section chip row. */
export type ModeFilter = "all" | "classic" | "ranked" | "daily";

export type StatTriple = {
  n: number;
  correct: number;
  sumLatencyMs: number;
};

export type ByOpStats = Record<Op, StatTriple>;
export type MulFactsStats = Record<string, StatTriple>; // key: "axb", a<=b

export type RunRollup = {
  byOp: ByOpStats;
  mulFacts: MulFactsStats;
  problemsCorrect: number;
  byTag: Record<string, TagStats>;
  tagVersion: number;
};

export const ALL_OPS: readonly Op[] = ["add", "sub", "mul", "div"] as const;

export function emptyTriple(): StatTriple {
  return { n: 0, correct: 0, sumLatencyMs: 0 };
}

export function emptyByOp(): ByOpStats {
  return {
    add: emptyTriple(),
    sub: emptyTriple(),
    mul: emptyTriple(),
    div: emptyTriple(),
  };
}

/** Canonicalized fact key — 7×8 and 8×7 collapse to the same cell. */
export function mulFactKey(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}x${hi}`;
}

function parseProblemIndex(problemId: string): number {
  const m = problemId.match(/^p(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Walk the per-round events and roll them up into byOp + mulFacts + byTag
 * triples. The events array doesn't carry the operands; we re-derive each
 * problem from (seed, index, generatorConfig). Same derivation the engine
 * itself uses, so this is correct by construction.
 *
 * Only mul problems with BOTH factors in [2, 12] contribute to mulFacts —
 * those are the cells the heatmap renders. Larger factors (e.g. 7×54 from
 * Zetamac defaults) still count for byOp.mul but skip the grid.
 *
 * The byTag rollup applies the late-round fatigue filter (drop events
 * submitted in the last 10s of the round) so per-tag latencies aren't
 * contaminated by end-of-round rushing.
 */
export function rollupRun(
  seed: string,
  generatorConfig: GeneratorConfig,
  events: AnswerEvent[],
  durationMs: number,
): RunRollup {
  const seedHash = hashString(seed);
  const byOp = emptyByOp();
  const mulFacts: MulFactsStats = {};
  let problemsCorrect = 0;

  for (const event of events) {
    const idx = parseProblemIndex(event.problemId);
    if (idx < 0) continue;
    const problem = generateProblem(seedHash, idx, generatorConfig);

    const slot = byOp[problem.op];
    slot.n += 1;
    if (event.correct) slot.correct += 1;
    slot.sumLatencyMs += event.latencyMs;
    if (event.correct) problemsCorrect += 1;

    if (
      problem.op === "mul" &&
      problem.a >= MUL_FACT_MIN && problem.a <= MUL_FACT_MAX &&
      problem.b >= MUL_FACT_MIN && problem.b <= MUL_FACT_MAX
    ) {
      const key = mulFactKey(problem.a, problem.b);
      const cell = mulFacts[key] ?? emptyTriple();
      cell.n += 1;
      if (event.correct) cell.correct += 1;
      cell.sumLatencyMs += event.latencyMs;
      mulFacts[key] = cell;
    }
  }

  const tags = rollupTagsFromRound(seed, generatorConfig, events, durationMs);

  return {
    byOp,
    mulFacts,
    problemsCorrect,
    byTag: tags.byTag,
    tagVersion: tags.tagVersion,
  };
}

/** Convenience for callers holding a full RoundResult. */
export function rollupRoundResult(
  seed: string,
  generatorConfig: GeneratorConfig,
  result: RoundResult,
  durationMs: number,
): RunRollup {
  return rollupRun(seed, generatorConfig, result.events, durationMs);
}

// ---------------------------------------------------------------------------
// Read-time aggregations. Each takes the persisted v2 history array and
// returns view-model data. Pure, O(rows) for typical inputs.
// ---------------------------------------------------------------------------

/**
 * The canonical in-memory shape returned to readers. The localStorage layer
 * normalizes both v2 and v3 rows into this shape (v3 with byTag, tagVersion).
 * Migrated v2 rows have byTag={} and tagVersion=0 — invisible to the
 * weak-pattern diagnostic, but still queryable for op/mulFact stats.
 */
export type RunRow = {
  v: 3;
  mode?: SaveMode;
  score: number;
  problemsAttempted: number;
  problemsCorrect: number;
  meanLatencyMs: number;
  durationMs: number;
  endedAt: number;
  byOp: ByOpStats;
  mulFacts: MulFactsStats;
  byTag: Record<string, TagStats>;
  /** TAG_VERSION at the time the row was saved. 0 = legacy v2 row, no tags. */
  tagVersion: number;
};

export type OpSummary = {
  n: number;
  correct: number;
  accuracy: number;       // 0..1; 0 when n=0
  meanLatencyMs: number;  // 0 when n=0
};

export function summarizeByOp(rows: RunRow[]): Record<Op, OpSummary> {
  const totals = emptyByOp();
  for (const row of rows) {
    for (const op of ALL_OPS) {
      const slot = row.byOp[op] ?? emptyTriple();
      totals[op].n += slot.n;
      totals[op].correct += slot.correct;
      totals[op].sumLatencyMs += slot.sumLatencyMs;
    }
  }
  const out = {} as Record<Op, OpSummary>;
  for (const op of ALL_OPS) {
    const t = totals[op];
    out[op] = {
      n: t.n,
      correct: t.correct,
      accuracy: t.n > 0 ? t.correct / t.n : 0,
      meanLatencyMs: t.n > 0 ? t.sumLatencyMs / t.n : 0,
    };
  }
  return out;
}

export type FactSummary = {
  a: number;            // 2..12 (low factor)
  b: number;            // 2..12 (high factor)
  n: number;
  correct: number;
  accuracy: number;     // 0..1
  meanLatencyMs: number;
};

/**
 * Roll up per-fact stats across all rows. Returns one entry per (a, b) cell
 * the user has actually attempted at least once. Cold-start cells (no data)
 * are NOT in the result — the consumer fills them in based on the canonical
 * 2..12 grid.
 */
export function summarizeMulFacts(rows: RunRow[]): FactSummary[] {
  const totals: Record<string, StatTriple> = {};
  for (const row of rows) {
    for (const [key, cell] of Object.entries(row.mulFacts ?? {})) {
      const t = totals[key] ?? emptyTriple();
      t.n += cell.n;
      t.correct += cell.correct;
      t.sumLatencyMs += cell.sumLatencyMs;
      totals[key] = t;
    }
  }
  return Object.entries(totals).map(([key, t]) => {
    const [aStr, bStr] = key.split("x");
    return {
      a: parseInt(aStr, 10),
      b: parseInt(bStr, 10),
      n: t.n,
      correct: t.correct,
      accuracy: t.n > 0 ? t.correct / t.n : 0,
      meanLatencyMs: t.n > 0 ? t.sumLatencyMs / t.n : 0,
    };
  });
}

export type ScorePoint = { score: number; endedAt: number };

/** Last N runs in chronological order (oldest first). Defaults to 30. */
export function lastNScores(rows: RunRow[], n = 30): ScorePoint[] {
  const sorted = [...rows].sort((x, y) => x.endedAt - y.endedAt);
  return sorted.slice(-n).map((r) => ({ score: r.score, endedAt: r.endedAt }));
}

export type LifetimeTotals = {
  runs: number;
  problemsAttempted: number;
  problemsCorrect: number;
  totalDurationMs: number;
};

export function lifetimeTotals(rows: RunRow[]): LifetimeTotals {
  let runs = 0;
  let problemsAttempted = 0;
  let problemsCorrect = 0;
  let totalDurationMs = 0;
  for (const r of rows) {
    runs += 1;
    problemsAttempted += r.problemsAttempted;
    problemsCorrect += r.problemsCorrect;
    totalDurationMs += r.durationMs;
  }
  return { runs, problemsAttempted, problemsCorrect, totalDurationMs };
}

// ---------------------------------------------------------------------------
// Tag aggregation + weak-pattern diagnostic.
// ---------------------------------------------------------------------------

function rowMatchesFilter(row: RunRow, filter: ModeFilter): boolean {
  if (filter === "all") return true;
  return row.mode === filter;
}

/**
 * Aggregate per-tag stats across rows. Filters by mode + tagVersion (only
 * rows tagged with the current TAG_VERSION contribute — legacy v2 rows
 * have tagVersion=0 and are silently skipped). Returns the merged byTag
 * map ready for rendering or further reduction.
 */
export function summarizeTags(
  rows: RunRow[],
  filter: ModeFilter = "all",
): Record<string, TagStats> {
  const totals: Record<string, TagStats> = {};
  for (const row of rows) {
    if (row.tagVersion !== TAG_VERSION) continue;
    if (!rowMatchesFilter(row, filter)) continue;
    for (const [tag, s] of Object.entries(row.byTag)) {
      let cur = totals[tag];
      if (!cur) {
        cur = emptyTagStats();
        totals[tag] = cur;
      }
      cur.n += s.n;
      cur.correct += s.correct;
      cur.sum_log_lat += s.sum_log_lat;
      cur.sum_log_lat_sq += s.sum_log_lat_sq;
      cur.sum_ttf_ms += s.sum_ttf_ms;
      cur.sum_exec_ms += s.sum_exec_ms;
      cur.errors.off_by_one += s.errors.off_by_one;
      cur.errors.off_by_ten += s.errors.off_by_ten;
      cur.errors.transposition += s.errors.transposition;
      cur.errors.other += s.errors.other;
    }
  }
  return totals;
}

export type FocusResult = {
  /** The tag that won the diagnostic (the "weakest" pattern). */
  tag: string;
  /** Posterior probability this tag is genuinely weak. >= 0.7 to surface. */
  weakness_prob: number;
  /** How many qualifying events feed this tag's mean. */
  n: number;
  /** Tag's empirical-Bayes-shrunken log-mean latency. */
  log_mean: number;
  /** User's overall log-mean (the baseline this tag is compared against). */
  user_log_mean: number;
};

/** Algorithm parameters — exposed for testing and tuning. */
export const FOCUS_PARAMS = {
  MIN_TOTAL_N: 30,
  MIN_TAG_N: 10,
  SHRINKAGE_K: 10,
  PROB_THRESHOLD: 0.7,
  /** Multiplier on z before sigmoid — controls how sharply prob ramps. */
  SIGMOID_GAIN: 1.5,
} as const;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Empirical-Bayes shrinkage + within-user log-RT z-score → posterior
 * weakness probability. Surface single tag with highest probability above
 * threshold, gated by sample-size floors.
 *
 * - User-level baseline: aggregated across ALL the user's tagged events
 *   (regardless of which tag each event belongs to). Both mean and stddev
 *   are computed in log-RT space to handle right-skew.
 * - Per-tag shrinkage: tag's raw log-mean is pulled toward the user mean
 *   with weight n / (n + SHRINKAGE_K). Soft, no cliff.
 * - Posterior: sigmoid of z * gain. Surface only when prob ≥ threshold AND
 *   tag n ≥ MIN_TAG_N AND total n ≥ MIN_TOTAL_N.
 *
 * Returns null when no tag clears the bar — the UI shows the cold-start
 * "drill more rounds to unlock" hint.
 */
export function findFocusTag(
  rows: RunRow[],
  filter: ModeFilter = "all",
): FocusResult | null {
  const totals = summarizeTags(rows, filter);

  let totalN = 0;
  let sumLogLat = 0;
  let sumLogLatSq = 0;
  for (const t of Object.values(totals)) {
    totalN += t.n;
    sumLogLat += t.sum_log_lat;
    sumLogLatSq += t.sum_log_lat_sq;
  }
  if (totalN < FOCUS_PARAMS.MIN_TOTAL_N) return null;

  const userLogMean = sumLogLat / totalN;
  const userVar = sumLogLatSq / totalN - userLogMean * userLogMean;
  const userLogStddev = Math.max(Math.sqrt(Math.max(userVar, 0)), 0.01);

  let best: FocusResult | null = null;
  for (const [tag, t] of Object.entries(totals)) {
    if (t.n < FOCUS_PARAMS.MIN_TAG_N) continue;
    const rawLogMean = t.sum_log_lat / t.n;
    const shrunk =
      (t.n * rawLogMean + FOCUS_PARAMS.SHRINKAGE_K * userLogMean) /
      (t.n + FOCUS_PARAMS.SHRINKAGE_K);
    const z = (shrunk - userLogMean) / userLogStddev;
    const weaknessProb = sigmoid(z * FOCUS_PARAMS.SIGMOID_GAIN);
    if (
      weaknessProb >= FOCUS_PARAMS.PROB_THRESHOLD &&
      (!best || weaknessProb > best.weakness_prob)
    ) {
      best = {
        tag,
        weakness_prob: weaknessProb,
        n: t.n,
        log_mean: shrunk,
        user_log_mean: userLogMean,
      };
    }
  }
  return best;
}

/**
 * Total tagged events across rows (after filter). The Learn-mode unlock gate.
 * Counts only rows whose tagVersion matches the current TAG_VERSION.
 */
export function totalTaggedEvents(
  rows: RunRow[],
  filter: ModeFilter = "all",
): number {
  const totals = summarizeTags(rows, filter);
  let total = 0;
  for (const t of Object.values(totals)) total += t.n;
  return total;
}

/**
 * Top-N tags ranked by posterior weakness probability — relaxed gating used
 * by Learn mode to choose what to drill.
 *
 * Differs from `findFocusTag`:
 *   - No per-tag MIN_TAG_N floor (EB shrinkage already pulls low-n tags
 *     toward the user mean, so they can't dominate the ranking with noise).
 *   - No PROB_THRESHOLD cutoff (we want best-available signal, not just
 *     statistically-significant outliers).
 *   - Returns multiple tags in rank order rather than just the top one.
 *
 * Still gates on MIN_TOTAL_N — under that floor the user has no profile yet,
 * so Learn mode stays locked at the menu.
 */
export function topNWeakTags(
  rows: RunRow[],
  n: number,
  filter: ModeFilter = "all",
): FocusResult[] {
  const totals = summarizeTags(rows, filter);

  let totalN = 0;
  let sumLogLat = 0;
  let sumLogLatSq = 0;
  for (const t of Object.values(totals)) {
    totalN += t.n;
    sumLogLat += t.sum_log_lat;
    sumLogLatSq += t.sum_log_lat_sq;
  }
  if (totalN < FOCUS_PARAMS.MIN_TOTAL_N) return [];

  const userLogMean = sumLogLat / totalN;
  const userVar = sumLogLatSq / totalN - userLogMean * userLogMean;
  const userLogStddev = Math.max(Math.sqrt(Math.max(userVar, 0)), 0.01);

  const results: FocusResult[] = [];
  for (const [tag, t] of Object.entries(totals)) {
    if (t.n < 1) continue;
    const rawLogMean = t.sum_log_lat / t.n;
    const shrunk =
      (t.n * rawLogMean + FOCUS_PARAMS.SHRINKAGE_K * userLogMean) /
      (t.n + FOCUS_PARAMS.SHRINKAGE_K);
    const z = (shrunk - userLogMean) / userLogStddev;
    const weaknessProb = sigmoid(z * FOCUS_PARAMS.SIGMOID_GAIN);
    results.push({
      tag,
      weakness_prob: weaknessProb,
      n: t.n,
      log_mean: shrunk,
      user_log_mean: userLogMean,
    });
  }
  results.sort((a, b) => b.weakness_prob - a.weakness_prob);
  return results.slice(0, Math.max(0, n));
}
