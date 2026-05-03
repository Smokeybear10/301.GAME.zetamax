import { describe, expect, it } from "vitest";
import { ZETAMAC_DEFAULTS, generateProblem, hashString, type AnswerEvent } from "@/lib/drill";
import {
  emptyByOp,
  emptyTriple,
  lastNScores,
  lifetimeTotals,
  mulFactKey,
  rollupRun,
  summarizeByOp,
  summarizeMulFacts,
  type RunRow,
} from "@/lib/practice-stats";

// Build an AnswerEvent for a given problem index. Uses the same seeded
// generator as the engine; latency and correct flag are caller-supplied.
function eventFor(
  seed: string,
  idx: number,
  opts: { correct?: boolean; latencyMs?: number } = {},
): AnswerEvent {
  const seedHash = hashString(seed);
  const problem = generateProblem(seedHash, idx, ZETAMAC_DEFAULTS);
  const correct = opts.correct ?? true;
  return {
    problemId: `p${idx}`,
    typed: correct ? String(problem.answer) : "0",
    keystrokes: [],
    submittedAt: idx * 1000,
    correct,
    latencyMs: opts.latencyMs ?? 1000,
    corrections: 0,
  };
}

describe("mulFactKey", () => {
  it("collapses factor order — 7×8 == 8×7", () => {
    expect(mulFactKey(7, 8)).toBe(mulFactKey(8, 7));
    expect(mulFactKey(7, 8)).toBe("7x8");
  });

  it("identity factors stay themselves", () => {
    expect(mulFactKey(5, 5)).toBe("5x5");
    expect(mulFactKey(2, 12)).toBe("2x12");
  });
});

describe("rollupRun", () => {
  const seed = "rollup-test";

  it("returns empty stats for an empty events array", () => {
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, []);
    expect(r.problemsCorrect).toBe(0);
    expect(r.byOp).toEqual(emptyByOp());
    expect(r.mulFacts).toEqual({});
  });

  it("counts attempts, corrects, and latency per op", () => {
    const events: AnswerEvent[] = [
      eventFor(seed, 0, { correct: true, latencyMs: 1500 }),
      eventFor(seed, 1, { correct: false, latencyMs: 800 }),
      eventFor(seed, 2, { correct: true, latencyMs: 2000 }),
    ];
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events);
    let totalN = 0;
    let totalCorrect = 0;
    let totalLat = 0;
    for (const op of ["add", "sub", "mul", "div"] as const) {
      totalN += r.byOp[op].n;
      totalCorrect += r.byOp[op].correct;
      totalLat += r.byOp[op].sumLatencyMs;
    }
    expect(totalN).toBe(3);
    expect(totalCorrect).toBe(2);
    expect(totalLat).toBe(1500 + 800 + 2000);
    expect(r.problemsCorrect).toBe(2);
  });

  it("only adds to mulFacts when both factors are in [2, 12]", () => {
    // Walk many problems; verify any mul row outside the small-fact range
    // does NOT appear in mulFacts.
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 200; i++) {
      events.push(eventFor(seed, i));
    }
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events);
    const seedHash = hashString(seed);
    for (let i = 0; i < 200; i++) {
      const p = generateProblem(seedHash, i, ZETAMAC_DEFAULTS);
      if (p.op !== "mul") continue;
      const inRange =
        p.a >= 2 && p.a <= 12 && p.b >= 2 && p.b <= 12;
      const key = mulFactKey(p.a, p.b);
      if (inRange) {
        expect(r.mulFacts[key]).toBeDefined();
      } else {
        // out-of-range mul: still in byOp.mul, but not in mulFacts
        expect(r.mulFacts[key]).toBeUndefined();
      }
    }
    // All 200 events accounted for across all ops in byOp.
    const totalAcrossOps = Object.values(r.byOp).reduce((s, t) => s + t.n, 0);
    expect(totalAcrossOps).toBe(200);
  });

  it("ignores events with malformed problemIds", () => {
    const seedHash = hashString(seed);
    const p = generateProblem(seedHash, 0, ZETAMAC_DEFAULTS);
    const events: AnswerEvent[] = [
      {
        problemId: "garbage",
        typed: String(p.answer),
        keystrokes: [],
        submittedAt: 0,
        correct: true,
        latencyMs: 500,
        corrections: 0,
      },
    ];
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events);
    expect(r.problemsCorrect).toBe(0);
    expect(r.byOp).toEqual(emptyByOp());
  });
});

describe("summarizeByOp", () => {
  it("returns zeroed summary for an empty history", () => {
    const s = summarizeByOp([]);
    for (const op of ["add", "sub", "mul", "div"] as const) {
      expect(s[op]).toEqual({ n: 0, correct: 0, accuracy: 0, meanLatencyMs: 0 });
    }
  });

  it("aggregates triples additively across runs", () => {
    const rows: RunRow[] = [
      makeRow({ byOp: { add: { n: 10, correct: 8, sumLatencyMs: 12_000 } } }),
      makeRow({ byOp: { add: { n: 20, correct: 18, sumLatencyMs: 22_000 } } }),
    ];
    const s = summarizeByOp(rows);
    expect(s.add.n).toBe(30);
    expect(s.add.correct).toBe(26);
    expect(s.add.accuracy).toBeCloseTo(26 / 30);
    expect(s.add.meanLatencyMs).toBeCloseTo((12_000 + 22_000) / 30);
  });
});

describe("summarizeMulFacts", () => {
  it("returns no entries when no mul cells touched", () => {
    expect(summarizeMulFacts([])).toEqual([]);
  });

  it("merges per-fact triples and parses (a,b) from key", () => {
    const rows: RunRow[] = [
      makeRow({ mulFacts: { "7x8": { n: 3, correct: 2, sumLatencyMs: 3_000 } } }),
      makeRow({ mulFacts: { "7x8": { n: 5, correct: 5, sumLatencyMs: 4_000 } } }),
      makeRow({ mulFacts: { "5x5": { n: 2, correct: 2, sumLatencyMs: 1_500 } } }),
    ];
    const s = summarizeMulFacts(rows);
    const seven_eight = s.find((c) => c.a === 7 && c.b === 8);
    expect(seven_eight).toBeDefined();
    expect(seven_eight!.n).toBe(8);
    expect(seven_eight!.correct).toBe(7);
    expect(seven_eight!.meanLatencyMs).toBeCloseTo(7_000 / 8);
    const five_five = s.find((c) => c.a === 5 && c.b === 5);
    expect(five_five).toBeDefined();
    expect(five_five!.n).toBe(2);
  });
});

describe("lastNScores", () => {
  it("returns at most n entries, sorted oldest first", () => {
    const rows: RunRow[] = [10, 20, 30, 40, 50].map((s, i) =>
      makeRow({ score: s, endedAt: 1000 - i * 10 }), // intentionally out of order
    );
    const points = lastNScores(rows, 3);
    expect(points.map((p) => p.score)).toEqual([30, 20, 10]); // newest 3, oldest first
    // earlier endedAt values should sort first
    expect(points[0].endedAt).toBeLessThan(points[points.length - 1].endedAt);
  });

  it("defaults to 30 when n is omitted", () => {
    const rows: RunRow[] = Array.from({ length: 100 }, (_, i) =>
      makeRow({ score: i, endedAt: i * 100 }),
    );
    expect(lastNScores(rows).length).toBe(30);
  });
});

describe("lifetimeTotals", () => {
  it("sums the cheap top-level fields", () => {
    const rows: RunRow[] = [
      makeRow({ score: 30, problemsAttempted: 32, problemsCorrect: 30, durationMs: 120_000 }),
      makeRow({ score: 28, problemsAttempted: 30, problemsCorrect: 28, durationMs: 120_000 }),
    ];
    expect(lifetimeTotals(rows)).toEqual({
      runs: 2,
      problemsAttempted: 62,
      problemsCorrect: 58,
      totalDurationMs: 240_000,
    });
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type RowOverrides = {
  score?: number;
  problemsAttempted?: number;
  problemsCorrect?: number;
  meanLatencyMs?: number;
  durationMs?: number;
  endedAt?: number;
  byOp?: Partial<RunRow["byOp"]>;
  mulFacts?: RunRow["mulFacts"];
};

function makeRow(o: RowOverrides = {}): RunRow {
  return {
    v: 2,
    score: o.score ?? 0,
    problemsAttempted: o.problemsAttempted ?? 0,
    problemsCorrect: o.problemsCorrect ?? 0,
    meanLatencyMs: o.meanLatencyMs ?? 0,
    durationMs: o.durationMs ?? 120_000,
    endedAt: o.endedAt ?? Date.now(),
    byOp: {
      add: o.byOp?.add ?? emptyTriple(),
      sub: o.byOp?.sub ?? emptyTriple(),
      mul: o.byOp?.mul ?? emptyTriple(),
      div: o.byOp?.div ?? emptyTriple(),
    },
    mulFacts: o.mulFacts ?? {},
  };
}
