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

// 2..12 inclusive — the small-fact range that the heatmap covers.
export const MUL_FACT_MIN = 2;
export const MUL_FACT_MAX = 12;

/**
 * Practice modes. v1 ships only "classic"; the others are placeholders so
 * /practice/stats can filter or tab by mode without a schema bump when they
 * actually arrive.
 */
export type PracticeMode = "classic" | "quant" | "compound" | "weakness";

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
 * Walk the per-round events and roll them up into byOp + mulFacts triples.
 * The events array doesn't carry the operands; we re-derive each problem
 * from (seed, index, generatorConfig). Same derivation the engine itself
 * uses, so this is correct by construction.
 *
 * Only mul problems with BOTH factors in [2, 12] contribute to mulFacts —
 * those are the cells the heatmap renders. Larger factors (e.g. 7×54 from
 * Zetamac defaults) still count for byOp.mul but skip the grid.
 *
 * v2 (deferred) will additionally call deriveTags(a, b, op) and produce a
 * patternTags rollup. Not wired yet — see TODOS.md.
 */
export function rollupRun(
  seed: string,
  generatorConfig: GeneratorConfig,
  events: AnswerEvent[],
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

  return { byOp, mulFacts, problemsCorrect };
}

/** Convenience for callers holding a full RoundResult. */
export function rollupRoundResult(
  seed: string,
  generatorConfig: GeneratorConfig,
  result: RoundResult,
): RunRollup {
  return rollupRun(seed, generatorConfig, result.events);
}

// ---------------------------------------------------------------------------
// Read-time aggregations. Each takes the persisted v2 history array and
// returns view-model data. Pure, O(rows) for typical inputs.
// ---------------------------------------------------------------------------

export type RunRow = {
  v: 2;
  /** Optional for backward compat — legacy rows default to "classic" on read. */
  mode?: PracticeMode;
  score: number;
  problemsAttempted: number;
  problemsCorrect: number;
  meanLatencyMs: number;
  durationMs: number;
  endedAt: number;
  byOp: ByOpStats;
  mulFacts: MulFactsStats;
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
