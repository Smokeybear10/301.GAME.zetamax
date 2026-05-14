import { describe, expect, it } from "vitest";
import { ZETAMAC_DEFAULTS, generateProblem, hashString, type AnswerEvent } from "@/lib/drill";
import { TAG_VERSION } from "@/lib/drill/derive-tags";
import { emptyTagStats, type TagStats } from "@/lib/drill/round-analytics";
import {
  FOCUS_PARAMS,
  emptyByOp,
  emptyTriple,
  findFocusTag,
  lastNScores,
  lifetimeTotals,
  mulFactKey,
  rollupRun,
  summarizeByOp,
  summarizeMulFacts,
  summarizeTags,
  topNWeakTags,
  totalTaggedEvents,
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
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, [], 120_000);
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
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events, 120_000);
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
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events, 120_000);
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
    const r = rollupRun(seed, ZETAMAC_DEFAULTS, events, 120_000);
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
// summarizeTags + findFocusTag
// ---------------------------------------------------------------------------

/** Construct a TagStats representing n events with constant log-latency = ln(meanMs). */
function tagAt(n: number, meanMs: number, correct: number = n): TagStats {
  const logLat = Math.log(meanMs);
  return {
    n,
    correct,
    sum_log_lat: n * logLat,
    sum_log_lat_sq: n * logLat * logLat,
    sum_ttf_ms: n * meanMs * 0.4,
    sum_exec_ms: n * meanMs * 0.6,
    errors: { off_by_one: 0, off_by_ten: 0, transposition: 0, other: 0 },
  };
}

describe("summarizeTags", () => {
  it("ignores rows with stale tagVersion", () => {
    const rows: RunRow[] = [
      makeRow({ tagVersion: TAG_VERSION, byTag: { "by-9": tagAt(5, 1500) } }),
      // legacy row — tagVersion 0, byTag empty (or stale): silently dropped
      makeRow({ tagVersion: 0, byTag: { "by-9": tagAt(99, 9999) } }),
    ];
    const totals = summarizeTags(rows);
    expect(totals["by-9"]?.n).toBe(5);
  });

  it("filters by mode", () => {
    const rows: RunRow[] = [
      makeRow({ mode: "classic", tagVersion: TAG_VERSION, byTag: { "by-9": tagAt(10, 1500) } }),
      makeRow({ mode: "ranked", tagVersion: TAG_VERSION, byTag: { "by-9": tagAt(20, 2000) } }),
      makeRow({ mode: "daily", tagVersion: TAG_VERSION, byTag: { "by-9": tagAt(30, 1700) } }),
    ];
    expect(summarizeTags(rows, "all")["by-9"].n).toBe(60);
    expect(summarizeTags(rows, "classic")["by-9"].n).toBe(10);
    expect(summarizeTags(rows, "ranked")["by-9"].n).toBe(20);
    expect(summarizeTags(rows, "daily")["by-9"].n).toBe(30);
  });

  it("merges error counts across rows", () => {
    const a: TagStats = {
      ...emptyTagStats(),
      n: 3,
      correct: 2,
      errors: { off_by_one: 1, off_by_ten: 0, transposition: 0, other: 0 },
    };
    const b: TagStats = {
      ...emptyTagStats(),
      n: 4,
      correct: 4,
      errors: { off_by_one: 0, off_by_ten: 1, transposition: 1, other: 0 },
    };
    const rows: RunRow[] = [
      makeRow({ tagVersion: TAG_VERSION, byTag: { "mul-table": a } }),
      makeRow({ tagVersion: TAG_VERSION, byTag: { "mul-table": b } }),
    ];
    const totals = summarizeTags(rows);
    expect(totals["mul-table"].errors).toEqual({
      off_by_one: 1,
      off_by_ten: 1,
      transposition: 1,
      other: 0,
    });
  });
});

describe("findFocusTag", () => {
  it("returns null when total events below MIN_TOTAL_N", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(20, 2000),
          "mul-table": tagAt(5, 1000), // total 25 < 30
        },
      }),
    ];
    expect(findFocusTag(rows)).toBeNull();
  });

  it("returns null when no tag exceeds the probability threshold (uniform latencies)", () => {
    // 3 tags, each with 30 events at the same mean → no tag stands out
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "mul-table": tagAt(30, 1500),
          "add-no-carry": tagAt(30, 1500),
          "sub-no-borrow": tagAt(30, 1500),
        },
      }),
    ];
    expect(findFocusTag(rows)).toBeNull();
  });

  it("surfaces a clearly slow tag", () => {
    // by-9 at 2000ms, others at 1000ms. 4 tags × ~50 events each.
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(20, 2000),
          "mul-table": tagAt(60, 1000),
          "add-no-carry": tagAt(60, 1000),
          "sub-no-borrow": tagAt(60, 1000),
        },
      }),
    ];
    const result = findFocusTag(rows);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("by-9");
    expect(result!.weakness_prob).toBeGreaterThanOrEqual(FOCUS_PARAMS.PROB_THRESHOLD);
    expect(result!.n).toBe(20);
    expect(Math.exp(result!.log_mean)).toBeGreaterThan(Math.exp(result!.user_log_mean));
  });

  it("excludes tags below MIN_TAG_N from being chosen", () => {
    // by-9 has only 9 events but is dramatically slow. mul-table has many at
    // baseline. Total events ≥ 30. Expected: nothing fires (by-9 excluded).
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(9, 5000),
          "mul-table": tagAt(60, 1000),
          "add-no-carry": tagAt(40, 1000),
        },
      }),
    ];
    const result = findFocusTag(rows);
    expect(result).toBeNull();
  });

  it("respects mode filter (weakness in ranked but not in classic)", () => {
    const rows: RunRow[] = [
      makeRow({
        mode: "classic",
        tagVersion: TAG_VERSION,
        byTag: {
          "mul-table": tagAt(50, 1000),
          "by-9": tagAt(20, 1000),
          "add-no-carry": tagAt(40, 1000),
        },
      }),
      makeRow({
        mode: "ranked",
        tagVersion: TAG_VERSION,
        byTag: {
          "mul-table": tagAt(50, 1000),
          "by-9": tagAt(20, 2200),
          "add-no-carry": tagAt(40, 1000),
        },
      }),
    ];
    expect(findFocusTag(rows, "classic")).toBeNull();
    const ranked = findFocusTag(rows, "ranked");
    expect(ranked?.tag).toBe("by-9");
  });

  it("EB shrinkage pulls the tag's log_mean strictly between user_mean and raw_mean", () => {
    // by-9 raw log-mean is ln(2000) ≈ 7.601. After EB shrinkage with k=10 and
    // n=20, the value should be pulled toward user_log_mean but still above it.
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(20, 2000),
          "mul-table": tagAt(60, 1000),
          "add-no-carry": tagAt(60, 1000),
        },
      }),
    ];
    const result = findFocusTag(rows);
    expect(result).not.toBeNull();
    if (result) {
      const rawLogMean = Math.log(2000);
      expect(result.log_mean).toBeLessThan(rawLogMean); // pulled down toward user mean
      expect(result.log_mean).toBeGreaterThan(result.user_log_mean); // still above baseline
    }
  });

  it("EB shrinkage approaches raw mean as n grows (no cliff at MIN_TAG_N)", () => {
    // Hold the raw tag latency constant; vary n. The shrunken log_mean should
    // monotonically approach the raw log_mean as n increases.
    const rawLogMean = Math.log(2000);
    const ns = [11, 20, 50, 200];
    const shrunkenMeans: number[] = [];
    for (const n of ns) {
      const rows: RunRow[] = [
        makeRow({
          tagVersion: TAG_VERSION,
          byTag: {
            "by-9": tagAt(n, 2000),
            // Hold the rest constant — shrinkage behaviour we want to test
            "mul-table": tagAt(40, 1000),
            "add-no-carry": tagAt(40, 1000),
          },
        }),
      ];
      const result = findFocusTag(rows);
      expect(result, `n=${n} should fire`).not.toBeNull();
      shrunkenMeans.push(result!.log_mean);
    }
    // Distance to raw should be monotonically non-increasing
    const distances = shrunkenMeans.map((m) => Math.abs(rawLogMean - m));
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThanOrEqual(distances[i - 1]);
    }
    // Final value (n=200) should be very close to raw
    expect(distances[distances.length - 1]).toBeLessThan(0.05);
  });

  it("ignores rows with stale tagVersion when computing focus", () => {
    const rows: RunRow[] = [
      // Stale rows: would suggest by-9 weakness if counted, but tagVersion=0
      makeRow({
        tagVersion: 0,
        byTag: { "by-9": tagAt(50, 5000), "mul-table": tagAt(50, 1000) },
      }),
      // Current rows: uniform → nothing weak
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "mul-table": tagAt(40, 1500),
          "add-no-carry": tagAt(40, 1500),
        },
      }),
    ];
    expect(findFocusTag(rows)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// totalTaggedEvents + topNWeakTags
// ---------------------------------------------------------------------------

describe("totalTaggedEvents", () => {
  it("returns 0 for empty rows", () => {
    expect(totalTaggedEvents([])).toBe(0);
  });

  it("sums n across all tags from current-version rows", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(10, 1500),
          "mul-table": tagAt(20, 1000),
        },
      }),
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: { "by-9": tagAt(5, 1500) },
      }),
    ];
    expect(totalTaggedEvents(rows)).toBe(35);
  });

  it("ignores stale-version rows", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: 0,
        byTag: { "by-9": tagAt(99, 1500) },
      }),
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: { "by-9": tagAt(7, 1500) },
      }),
    ];
    expect(totalTaggedEvents(rows)).toBe(7);
  });
});

describe("topNWeakTags", () => {
  it("returns [] when below MIN_TOTAL_N", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: { "by-9": tagAt(10, 2500), "mul-table": tagAt(10, 1000) },
      }),
    ];
    expect(topNWeakTags(rows, 3)).toEqual([]);
  });

  it("returns ranked results above MIN_TOTAL_N — slowest tag first", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(20, 2500),         // slowest
          "near-square": tagAt(20, 2000),  // 2nd
          "mul-table": tagAt(20, 1500),    // 3rd
          "add-no-carry": tagAt(20, 1000),
          "sub-no-borrow": tagAt(20, 1000),
        },
      }),
    ];
    const top3 = topNWeakTags(rows, 3);
    expect(top3.map((r) => r.tag)).toEqual(["by-9", "near-square", "mul-table"]);
  });

  it("returns no more than n results", () => {
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(15, 2500),
          "mul-table": tagAt(15, 2000),
          "add-no-carry": tagAt(15, 1500),
          "sub-no-borrow": tagAt(15, 1000),
        },
      }),
    ];
    expect(topNWeakTags(rows, 2).length).toBe(2);
    expect(topNWeakTags(rows, 10).length).toBe(4); // 4 distinct tags only
  });

  it("does not require per-tag n ≥ MIN_TAG_N (relaxed gating)", () => {
    // MIN_TAG_N is 10. Mix one low-n tag with high-n tags. All should appear.
    const rows: RunRow[] = [
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "by-9": tagAt(3, 5000),         // low-n but very slow
          "mul-table": tagAt(20, 1000),
          "add-no-carry": tagAt(20, 1000),
        },
      }),
    ];
    const top = topNWeakTags(rows, 3);
    expect(top.length).toBe(3);
    // Even though by-9 is slow, EB shrinkage pulls n=3 toward user mean.
    // Just verify it's present; ordering with shrinkage is the point.
    expect(top.map((r) => r.tag)).toContain("by-9");
  });

  it("ignores stale-version rows", () => {
    const rows: RunRow[] = [
      // Stale row with a clear winner — should NOT influence ranking.
      makeRow({
        tagVersion: 0,
        byTag: { "by-9": tagAt(50, 9000) },
      }),
      // Current rows — uniform, no clear weakness
      makeRow({
        tagVersion: TAG_VERSION,
        byTag: {
          "mul-table": tagAt(20, 1500),
          "add-no-carry": tagAt(20, 1500),
        },
      }),
    ];
    const top = topNWeakTags(rows, 3);
    expect(top.map((r) => r.tag)).not.toContain("by-9");
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
  mode?: RunRow["mode"];
  byOp?: Partial<RunRow["byOp"]>;
  mulFacts?: RunRow["mulFacts"];
  byTag?: RunRow["byTag"];
  tagVersion?: number;
};

function makeRow(o: RowOverrides = {}): RunRow {
  return {
    v: 3,
    mode: o.mode,
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
    byTag: o.byTag ?? {},
    tagVersion: o.tagVersion ?? 0,
  };
}
