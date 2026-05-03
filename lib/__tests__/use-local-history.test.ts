import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZETAMAC_DEFAULTS, generateProblem, hashString, type RoundResult } from "@/lib/drill";
import {
  clearHistory,
  getHistory,
  getStats,
  saveRun,
} from "@/lib/use-local-history";

const STORAGE_KEY_V1 = "zetamax:practice-history";
const STORAGE_KEY = "zetamax:practice-history-v2";

class FakeStorage {
  store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  // @ts-expect-error - injecting a window stub into node test runtime
  globalThis.window = { localStorage: storage };
});

afterEach(() => {
  // @ts-expect-error - cleanup
  delete globalThis.window;
});

// Build a synthetic RoundResult with N correct events, all using the same
// seed so problem indices map to real Zetamac problems.
function makeResult(seed: string, n: number, opts: { score?: number } = {}): RoundResult {
  const seedHash = hashString(seed);
  const events = Array.from({ length: n }, (_, i) => {
    const p = generateProblem(seedHash, i, ZETAMAC_DEFAULTS);
    return {
      problemId: `p${i}`,
      typed: String(p.answer),
      keystrokes: [],
      submittedAt: i * 1500,
      correct: true,
      latencyMs: 1500,
      corrections: 0,
    };
  });
  return {
    score: opts.score ?? n,
    problemsAttempted: n,
    problemsCorrect: n,
    accuracy: 1,
    meanLatencyMs: 1500,
    events,
  };
}

describe("getHistory", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(getHistory()).toEqual([]);
  });

  it("survives malformed JSON without throwing", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    expect(getHistory()).toEqual([]);
  });

  it("filters out non-array shapes", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ score: 10 }));
    expect(getHistory()).toEqual([]);
  });
});

describe("saveRun", () => {
  it("round-trips a run through storage and computes byOp/mulFacts", () => {
    const result = makeResult("rt-1", 20);
    const saved = saveRun("classic", "rt-1", ZETAMAC_DEFAULTS, result);
    expect(saved.v).toBe(2);
    expect(saved.mode).toBe("classic");
    expect(saved.score).toBe(20);
    expect(saved.problemsCorrect).toBe(20);
    // byOp should sum to 20 across all 4 ops.
    const total = Object.values(saved.byOp).reduce((s, t) => s + t.n, 0);
    expect(total).toBe(20);

    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(saved);
  });

  it("caps history at MAX_STORED rows", () => {
    // Pre-fill with 1005 valid v2 rows.
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      v: 2 as const,
      score: i,
      problemsAttempted: i,
      problemsCorrect: i,
      meanLatencyMs: 1000,
      durationMs: 120_000,
      endedAt: i * 1000,
      byOp: {
        add: { n: 0, correct: 0, sumLatencyMs: 0 },
        sub: { n: 0, correct: 0, sumLatencyMs: 0 },
        mul: { n: 0, correct: 0, sumLatencyMs: 0 },
        div: { n: 0, correct: 0, sumLatencyMs: 0 },
      },
      mulFacts: {},
    }));
    storage.setItem(STORAGE_KEY, JSON.stringify(rows));

    saveRun("classic", "cap-1", ZETAMAC_DEFAULTS, makeResult("cap-1", 5, { score: 5 }));
    const history = getHistory();
    expect(history.length).toBe(1000);
    // Newest run survives — its score is 5 and it should be at the end.
    expect(history[history.length - 1].score).toBe(5);
  });

  it("does not throw when localStorage.setItem throws (QuotaExceeded)", () => {
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() =>
      saveRun("classic", "q-1", ZETAMAC_DEFAULTS, makeResult("q-1", 3)),
    ).not.toThrow();
  });
});

describe("v1 → v2 migration", () => {
  const v1Rows = [
    { score: 30, problemsAttempted: 32, accuracy: 30 / 32, meanLatencyMs: 1100, endedAt: 100 },
    { score: 25, problemsAttempted: 27, accuracy: 25 / 27, meanLatencyMs: 1300, endedAt: 200 },
  ];

  it("copies v1 rows into v2 with empty byOp/mulFacts and removes v1 key", () => {
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    const history = getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].score).toBe(30);
    expect(history[0].v).toBe(2);
    // byOp was unknown — every triple should be zeroed.
    for (const op of ["add", "sub", "mul", "div"] as const) {
      expect(history[0].byOp[op]).toEqual({ n: 0, correct: 0, sumLatencyMs: 0 });
    }
    expect(history[0].mulFacts).toEqual({});
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("is idempotent — calling getHistory again does not re-migrate", () => {
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    getHistory(); // first call migrates
    // Re-add v1 rows AFTER v2 already has data — should be dropped on next read.
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    const second = getHistory();
    expect(second).toHaveLength(2); // v2 untouched
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull(); // v1 dropped
  });

  it("filters invalid v1 rows during migration", () => {
    const mixed = [...v1Rows, { score: "bad" }, null, "string", 42];
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(mixed));
    const history = getHistory();
    expect(history).toHaveLength(2);
  });

  it("ignores malformed v1 JSON", () => {
    storage.setItem(STORAGE_KEY_V1, "{not json");
    expect(getHistory()).toEqual([]);
  });
});

describe("clearHistory", () => {
  it("removes both v1 and v2 keys", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify([]));
    storage.setItem(STORAGE_KEY_V1, JSON.stringify([]));
    clearHistory();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull();
  });
});

describe("getStats backward-compat", () => {
  it("computes lifetimeBest from v2 rows", () => {
    saveRun("classic", "s-1", ZETAMAC_DEFAULTS, makeResult("s-1", 10, { score: 10 }));
    saveRun("classic", "s-2", ZETAMAC_DEFAULTS, makeResult("s-2", 20, { score: 20 }));
    const stats = getStats();
    expect(stats.lifetimeBest).toBe(20);
    expect(stats.totalRuns).toBe(2);
    // todayBest also equals 20 since both runs were just saved.
    expect(stats.todayBest).toBe(20);
  });

  it("returns zeros on an empty history", () => {
    expect(getStats()).toEqual({ todayBest: 0, lifetimeBest: 0, totalRuns: 0 });
  });
});
