import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ZETAMAC_DEFAULTS,
  generateProblem,
  hashString,
  type RoundResult,
} from "@/lib/drill";
import { TAG_VERSION } from "@/lib/drill/derive-tags";
import {
  clearHistory,
  getHistory,
  getStats,
  saveRun,
} from "@/lib/use-local-history";

const STORAGE_KEY_V1 = "zetamax:practice-history";
const STORAGE_KEY_V2 = "zetamax:practice-history-v2";
const STORAGE_KEY_V3 = "zetamax:practice-history-v3";
const STORAGE_KEY = "zetamax:practice-history-v4";

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

const DURATION_MS = 120_000;

// Build a synthetic RoundResult with N correct events. Real keystrokes
// included so the tag rollup has something to chew on (TTF, log-latency).
function makeResult(seed: string, n: number, opts: { score?: number } = {}): RoundResult {
  const seedHash = hashString(seed);
  const events = Array.from({ length: n }, (_, i) => {
    const p = generateProblem(seedHash, i, ZETAMAC_DEFAULTS);
    const submittedAt = (i + 1) * 1500;
    return {
      problemId: `p${i}`,
      typed: String(p.answer),
      keystrokes: [
        { key: "5", t: 600 },
        { key: "Enter", t: 1450 },
      ],
      submittedAt,
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
  it("round-trips a v4 run with byTag and tagVersion", () => {
    const result = makeResult("rt-1", 20);
    const saved = saveRun("classic", "rt-1", ZETAMAC_DEFAULTS, result, DURATION_MS);
    expect(saved.v).toBe(4);
    expect(saved.mode).toBe("classic");
    // Practice rows now get a client-generated UUID so they can be synced
    // to the server (idempotent upsert keyed on this id).
    expect(saved.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(saved.score).toBe(20);
    expect(saved.problemsCorrect).toBe(20);
    expect(saved.tagVersion).toBe(TAG_VERSION);
    // byOp should sum to 20 across all 4 ops.
    const byOpTotal = Object.values(saved.byOp).reduce((s, t) => s + t.n, 0);
    expect(byOpTotal).toBe(20);
    // byTag total also 20 (single-attribution: each event hits one tag)
    const byTagTotal = Object.values(saved.byTag).reduce((s, t) => s + t.n, 0);
    expect(byTagTotal).toBe(20);

    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(saved);
  });

  it("accepts new modes (ranked, daily) for cross-mode aggregation", () => {
    const ranked = saveRun(
      "ranked",
      "rk-1",
      ZETAMAC_DEFAULTS,
      makeResult("rk-1", 10),
      DURATION_MS,
    );
    expect(ranked.mode).toBe("ranked");
    const daily = saveRun(
      "daily",
      "d-1",
      ZETAMAC_DEFAULTS,
      makeResult("d-1", 8),
      DURATION_MS,
    );
    expect(daily.mode).toBe("daily");
    const history = getHistory();
    const modes = history.map((r) => r.mode);
    expect(modes.sort()).toEqual(["daily", "ranked"]);
  });

  it("caps history at MAX_STORED rows", () => {
    // Pre-fill v4 storage directly with 1005 valid rows.
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      v: 4 as const,
      mode: "classic" as const,
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
      byTag: {},
      tagVersion: TAG_VERSION,
    }));
    storage.setItem(STORAGE_KEY, JSON.stringify(rows));

    saveRun(
      "classic",
      "cap-1",
      ZETAMAC_DEFAULTS,
      makeResult("cap-1", 5, { score: 5 }),
      DURATION_MS,
    );
    const history = getHistory();
    expect(history.length).toBe(1000);
    expect(history[history.length - 1].score).toBe(5);
  });

  it("does not throw when localStorage.setItem throws (QuotaExceeded)", () => {
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() =>
      saveRun("classic", "q-1", ZETAMAC_DEFAULTS, makeResult("q-1", 3), DURATION_MS),
    ).not.toThrow();
  });
});

describe("v1 → v4 migration", () => {
  const v1Rows = [
    { score: 30, problemsAttempted: 32, accuracy: 30 / 32, meanLatencyMs: 1100, endedAt: 100 },
    { score: 25, problemsAttempted: 27, accuracy: 25 / 27, meanLatencyMs: 1300, endedAt: 200 },
  ];

  it("copies v1 rows into v4 with empty byOp/mulFacts/byTag and removes v1 key", () => {
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    const history = getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].v).toBe(4);
    expect(history[0].score).toBe(30);
    expect(history[0].mode).toBe("classic");
    for (const op of ["add", "sub", "mul", "div"] as const) {
      expect(history[0].byOp[op]).toEqual({ n: 0, correct: 0, sumLatencyMs: 0 });
    }
    expect(history[0].mulFacts).toEqual({});
    expect(history[0].byTag).toEqual({});
    expect(history[0].tagVersion).toBe(0); // legacy → invisible to diagnostic
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("is idempotent — calling getHistory again does not re-migrate", () => {
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    getHistory();
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(v1Rows));
    const second = getHistory();
    expect(second).toHaveLength(2);
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull();
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

describe("v2 → v4 migration", () => {
  const v2Rows = [
    {
      v: 2,
      mode: "classic",
      score: 30,
      problemsAttempted: 32,
      problemsCorrect: 30,
      meanLatencyMs: 1100,
      durationMs: 120_000,
      endedAt: 100,
      byOp: {
        add: { n: 4, correct: 4, sumLatencyMs: 4400 },
        sub: { n: 4, correct: 4, sumLatencyMs: 4400 },
        mul: { n: 4, correct: 4, sumLatencyMs: 4400 },
        div: { n: 4, correct: 4, sumLatencyMs: 4400 },
      },
      mulFacts: { "7x8": { n: 2, correct: 2, sumLatencyMs: 2200 } },
    },
  ];

  it("preserves byOp/mulFacts and adds empty byTag/tagVersion=0", () => {
    storage.setItem(STORAGE_KEY_V2, JSON.stringify(v2Rows));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].v).toBe(4);
    expect(history[0].mode).toBe("classic");
    expect(history[0].byOp.add.n).toBe(4);
    expect(history[0].mulFacts["7x8"]).toEqual({ n: 2, correct: 2, sumLatencyMs: 2200 });
    expect(history[0].byTag).toEqual({});
    expect(history[0].tagVersion).toBe(0);
    expect(history[0].runId).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY_V2)).toBeNull();
  });

  it("v4 wins when both v2 and v4 keys exist (v4 already migrated)", () => {
    const v4Row = {
      v: 4 as const,
      mode: "classic" as const,
      score: 99,
      problemsAttempted: 99,
      problemsCorrect: 99,
      meanLatencyMs: 1000,
      durationMs: 120_000,
      endedAt: 1,
      byOp: {
        add: { n: 0, correct: 0, sumLatencyMs: 0 },
        sub: { n: 0, correct: 0, sumLatencyMs: 0 },
        mul: { n: 0, correct: 0, sumLatencyMs: 0 },
        div: { n: 0, correct: 0, sumLatencyMs: 0 },
      },
      mulFacts: {},
      byTag: {},
      tagVersion: TAG_VERSION,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify([v4Row]));
    storage.setItem(STORAGE_KEY_V2, JSON.stringify(v2Rows));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(99);
    expect(storage.getItem(STORAGE_KEY_V2)).toBeNull();
  });
});

describe("v3 → v4 migration", () => {
  const v3Rows = [
    {
      v: 3 as const,
      mode: "ranked" as const,
      score: 40,
      problemsAttempted: 42,
      problemsCorrect: 40,
      meanLatencyMs: 1200,
      durationMs: 120_000,
      endedAt: 500,
      byOp: {
        add: { n: 10, correct: 10, sumLatencyMs: 11_000 },
        sub: { n: 10, correct: 10, sumLatencyMs: 11_000 },
        mul: { n: 10, correct: 10, sumLatencyMs: 11_000 },
        div: { n: 10, correct: 10, sumLatencyMs: 11_000 },
      },
      mulFacts: { "6x7": { n: 3, correct: 3, sumLatencyMs: 3300 } },
      byTag: {},
      tagVersion: 0,
    },
  ];

  it("walks v3 rows forward to v4 with runId undefined and removes v3 key", () => {
    storage.setItem(STORAGE_KEY_V3, JSON.stringify(v3Rows));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].v).toBe(4);
    expect(history[0].mode).toBe("ranked");
    expect(history[0].score).toBe(40);
    expect(history[0].byOp.add.n).toBe(10);
    expect(history[0].mulFacts["6x7"]).toEqual({ n: 3, correct: 3, sumLatencyMs: 3300 });
    expect(history[0].runId).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY_V3)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("v4 wins when both v3 and v4 keys exist", () => {
    const v4Row = {
      v: 4 as const,
      mode: "classic" as const,
      score: 77,
      problemsAttempted: 77,
      problemsCorrect: 77,
      meanLatencyMs: 900,
      durationMs: 120_000,
      endedAt: 1,
      byOp: {
        add: { n: 0, correct: 0, sumLatencyMs: 0 },
        sub: { n: 0, correct: 0, sumLatencyMs: 0 },
        mul: { n: 0, correct: 0, sumLatencyMs: 0 },
        div: { n: 0, correct: 0, sumLatencyMs: 0 },
      },
      mulFacts: {},
      byTag: {},
      tagVersion: TAG_VERSION,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify([v4Row]));
    storage.setItem(STORAGE_KEY_V3, JSON.stringify(v3Rows));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(77);
    expect(storage.getItem(STORAGE_KEY_V3)).toBeNull();
  });
});

describe("saveRun runId option", () => {
  it("persists runId when provided (ranked/daily) and reads it back", () => {
    const result = makeResult("rid-1", 5);
    const saved = saveRun(
      "ranked",
      "rid-1",
      ZETAMAC_DEFAULTS,
      result,
      DURATION_MS,
      { runId: "11111111-2222-3333-4444-555555555555" },
    );
    expect(saved.runId).toBe("11111111-2222-3333-4444-555555555555");
    const history = getHistory();
    expect(history[0].runId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("auto-generates a UUID for practice modes when runId is omitted", () => {
    const saved = saveRun(
      "classic",
      "rid-2",
      ZETAMAC_DEFAULTS,
      makeResult("rid-2", 3),
      DURATION_MS,
    );
    expect(saved.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("clearHistory", () => {
  it("removes v1, v2, v3, and v4 keys", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify([]));
    storage.setItem(STORAGE_KEY_V3, JSON.stringify([]));
    storage.setItem(STORAGE_KEY_V2, JSON.stringify([]));
    storage.setItem(STORAGE_KEY_V1, JSON.stringify([]));
    clearHistory();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY_V3)).toBeNull();
    expect(storage.getItem(STORAGE_KEY_V2)).toBeNull();
    expect(storage.getItem(STORAGE_KEY_V1)).toBeNull();
  });
});

describe("getStats backward-compat", () => {
  it("computes lifetimeBest from v3 rows", () => {
    saveRun("classic", "s-1", ZETAMAC_DEFAULTS, makeResult("s-1", 10, { score: 10 }), DURATION_MS);
    saveRun("classic", "s-2", ZETAMAC_DEFAULTS, makeResult("s-2", 20, { score: 20 }), DURATION_MS);
    const stats = getStats();
    expect(stats.lifetimeBest).toBe(20);
    expect(stats.totalRuns).toBe(2);
    expect(stats.todayBest).toBe(20);
  });

  it("returns zeros on an empty history", () => {
    expect(getStats()).toEqual({ todayBest: 0, lifetimeBest: 0, totalRuns: 0 });
  });
});
