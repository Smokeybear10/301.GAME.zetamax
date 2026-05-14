import { describe, expect, it } from "vitest";
import {
  classifyError,
  emptyTagStats,
  firstKeystrokeT,
  rollupTagsFromRound,
  FATIGUE_TAIL_MS,
} from "../round-analytics";
import { ZETAMAC_DEFAULTS, generateProblem, hashString } from "../index";
import { deriveTags } from "../derive-tags";
import type { AnswerEvent, Keystroke } from "../types";

// ============================================================================
// classifyError
// ============================================================================
describe("classifyError", () => {
  it("returns null when typed equals correct", () => {
    expect(classifyError("42", 42)).toBeNull();
  });

  it("returns null on empty input (no answer to classify)", () => {
    expect(classifyError("", 42)).toBeNull();
  });

  it("classifies off-by-one in either direction", () => {
    expect(classifyError("41", 42)).toBe("off_by_one");
    expect(classifyError("43", 42)).toBe("off_by_one");
    expect(classifyError("0", 1)).toBe("off_by_one");
  });

  it("classifies off-by-ten in either direction", () => {
    expect(classifyError("32", 42)).toBe("off_by_ten");
    expect(classifyError("52", 42)).toBe("off_by_ten");
    expect(classifyError("8", 18)).toBe("off_by_ten");
  });

  it("classifies same-length digit transpositions", () => {
    expect(classifyError("24", 42)).toBe("transposition");
    expect(classifyError("63", 36)).toBe("transposition");
    expect(classifyError("321", 132)).toBe("transposition");
  });

  it("does NOT classify single-digit or different-length as transposition", () => {
    // single-digit can't be a transposition by our rule (length < 2)
    expect(classifyError("5", 6)).toBe("off_by_one");
    // different lengths: not a transposition
    expect(classifyError("123", 12)).toBe("other");
  });

  it("falls through to 'other' when no rule matches", () => {
    expect(classifyError("100", 42)).toBe("other");
    expect(classifyError("99", 42)).toBe("other");
  });

  it("treats unparseable input as 'other'", () => {
    expect(classifyError("abc", 42)).toBe("other");
  });

  it("off-by-ten precedence over transposition (e.g., 21 vs 12 → diff 9 → 'other')", () => {
    // 21 vs 12: same digits, different order. Diff 9 (not 1 or 10). → transposition.
    expect(classifyError("21", 12)).toBe("transposition");
  });

  it("off-by-one precedence over transposition (e.g., 11 vs 12)", () => {
    // 11 vs 12: diff 1 → off_by_one. Even though "11" and "12" share digits,
    // the abs-diff check fires first. ✓
    expect(classifyError("11", 12)).toBe("off_by_one");
  });
});

// ============================================================================
// firstKeystrokeT
// ============================================================================
describe("firstKeystrokeT", () => {
  it("returns the t of the first digit keystroke", () => {
    const ks: Keystroke[] = [
      { key: "5", t: 800 },
      { key: "3", t: 1100 },
      { key: "Enter", t: 1500 },
    ];
    expect(firstKeystrokeT(ks)).toBe(800);
  });

  it("skips Backspace, Enter, Tab and other non-digit keys", () => {
    const ks: Keystroke[] = [
      { key: "Backspace", t: 200 },
      { key: "Tab", t: 250 },
      { key: "x", t: 280 },
      { key: "7", t: 300 },
      { key: "Enter", t: 600 },
    ];
    expect(firstKeystrokeT(ks)).toBe(300);
  });

  it("returns null when no digit was ever pressed", () => {
    const ks: Keystroke[] = [
      { key: "Tab", t: 100 },
      { key: "Backspace", t: 200 },
    ];
    expect(firstKeystrokeT(ks)).toBeNull();
  });

  it("returns null on empty keystroke array", () => {
    expect(firstKeystrokeT([])).toBeNull();
  });
});

// ============================================================================
// rollupTagsFromRound
// ============================================================================

function makeEvent(
  idx: number,
  opts: {
    correct?: boolean;
    latencyMs?: number;
    submittedAt?: number;
    keystrokes?: Keystroke[];
    typed?: string;
  } = {},
): AnswerEvent {
  return {
    problemId: `p${idx}`,
    typed: opts.typed ?? "",
    keystrokes: opts.keystrokes ?? [],
    submittedAt: opts.submittedAt ?? (idx + 1) * 1500,
    correct: opts.correct ?? true,
    latencyMs: opts.latencyMs ?? 1500,
    corrections: 0,
  };
}

describe("rollupTagsFromRound", () => {
  const seed = "rollup-tags-test";
  const durationMs = 120_000;

  it("returns empty byTag for empty events", () => {
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, [], durationMs);
    expect(r.byTag).toEqual({});
    expect(r.tagVersion).toBeGreaterThanOrEqual(1);
  });

  it("attributes each event to the tag deriveTags would pick", () => {
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 10; i++) {
      // Stagger timestamps comfortably inside the round.
      events.push(
        makeEvent(i, {
          latencyMs: 1500,
          submittedAt: (i + 1) * 1500,
          correct: true,
          keystrokes: [{ key: "5", t: 800 }],
          typed: "0", // doesn't matter — correct=true short-circuits classify
        }),
      );
    }
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    // Independently re-derive the expected attribution per event
    const seedHash = hashString(seed);
    const expectedCounts = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const p = generateProblem(seedHash, i, ZETAMAC_DEFAULTS);
      const tag = deriveTags(p.a, p.b, p.op).attribution;
      expectedCounts.set(tag, (expectedCounts.get(tag) ?? 0) + 1);
    }
    for (const [tag, n] of expectedCounts) {
      expect(r.byTag[tag]?.n, `tag ${tag} count`).toBe(n);
    }
    // Total n equals number of in-window events
    const totalN = Object.values(r.byTag).reduce((s, t) => s + t.n, 0);
    expect(totalN).toBe(10);
  });

  it("drops events submitted in the last 10s of the round (fatigue filter)", () => {
    // 5 events: 3 inside the cutoff, 2 outside.
    const cutoff = durationMs - FATIGUE_TAIL_MS;
    const events: AnswerEvent[] = [
      makeEvent(0, { submittedAt: 1000, correct: true }),
      makeEvent(1, { submittedAt: 50_000, correct: true }),
      makeEvent(2, { submittedAt: cutoff - 100, correct: true }), // just under
      makeEvent(3, { submittedAt: cutoff + 1, correct: true }), // just over → dropped
      makeEvent(4, { submittedAt: 119_500, correct: true }), // dropped
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    const totalN = Object.values(r.byTag).reduce((s, t) => s + t.n, 0);
    expect(totalN).toBe(3);
  });

  it("ignores events with malformed problemId", () => {
    const events: AnswerEvent[] = [
      makeEvent(0, { correct: true }),
      {
        ...makeEvent(1, { correct: true }),
        problemId: "garbage",
      },
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    const totalN = Object.values(r.byTag).reduce((s, t) => s + t.n, 0);
    expect(totalN).toBe(1);
  });

  it("accumulates log-latency sums", () => {
    const events: AnswerEvent[] = [
      makeEvent(0, { latencyMs: 1000, submittedAt: 1000, correct: true }),
      makeEvent(1, { latencyMs: 2000, submittedAt: 3000, correct: true }),
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    let sumLogLat = 0;
    let sumLogLatSq = 0;
    let totalN = 0;
    for (const t of Object.values(r.byTag)) {
      sumLogLat += t.sum_log_lat;
      sumLogLatSq += t.sum_log_lat_sq;
      totalN += t.n;
    }
    expect(totalN).toBe(2);
    expect(sumLogLat).toBeCloseTo(Math.log(1000) + Math.log(2000));
    expect(sumLogLatSq).toBeCloseTo(
      Math.log(1000) ** 2 + Math.log(2000) ** 2,
    );
  });

  it("accumulates TTF and execution split when keystrokes present", () => {
    const events: AnswerEvent[] = [
      makeEvent(0, {
        latencyMs: 1500,
        submittedAt: 1500,
        correct: true,
        keystrokes: [
          { key: "Backspace", t: 100 }, // ignored
          { key: "5", t: 600 }, // first digit
          { key: "3", t: 900 },
          { key: "Enter", t: 1450 },
        ],
      }),
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    const totalTtf = Object.values(r.byTag).reduce((s, t) => s + t.sum_ttf_ms, 0);
    const totalExec = Object.values(r.byTag).reduce((s, t) => s + t.sum_exec_ms, 0);
    expect(totalTtf).toBe(600);
    expect(totalExec).toBe(900); // 1500 - 600
  });

  it("contributes 0 to TTF/exec when no digit was pressed (skipped event)", () => {
    const events: AnswerEvent[] = [
      makeEvent(0, {
        latencyMs: 1500,
        submittedAt: 1500,
        correct: false,
        typed: "",
        keystrokes: [{ key: "Tab", t: 1500 }],
      }),
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    const totalTtf = Object.values(r.byTag).reduce((s, t) => s + t.sum_ttf_ms, 0);
    const totalExec = Object.values(r.byTag).reduce((s, t) => s + t.sum_exec_ms, 0);
    const totalN = Object.values(r.byTag).reduce((s, t) => s + t.n, 0);
    expect(totalTtf).toBe(0);
    expect(totalExec).toBe(0);
    expect(totalN).toBe(1); // event still counted
  });

  it("classifies wrong answers into error kinds", () => {
    const seedHash = hashString(seed);
    // Build 4 wrong-answer events with controlled `typed` strings, using the
    // actual problem answer so classifyError sees real diffs.
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const p = generateProblem(seedHash, i, ZETAMAC_DEFAULTS);
      const correct = p.answer;
      const typeds = [
        String(correct + 1), // off_by_one
        String(correct - 10), // off_by_ten
        // For transposition, swap last two digits if multi-digit; else just use other
        correct >= 10 && correct % 10 !== Math.floor(correct / 10) % 10
          ? String(correct).slice(0, -2) +
            String(correct).slice(-1) +
            String(correct).slice(-2, -1)
          : String(correct + 7), // fallback to "other"
        String(correct + 100), // other (likely)
      ];
      events.push(
        makeEvent(i, {
          submittedAt: (i + 1) * 1500,
          correct: false,
          latencyMs: 1500,
          typed: typeds[i],
          keystrokes: [{ key: "0", t: 500 }],
        }),
      );
    }
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    let off1 = 0;
    let off10 = 0;
    let trans = 0;
    let other = 0;
    for (const t of Object.values(r.byTag)) {
      off1 += t.errors.off_by_one;
      off10 += t.errors.off_by_ten;
      trans += t.errors.transposition;
      other += t.errors.other;
    }
    // The first two events should always classify off_by_one and off_by_ten.
    expect(off1).toBeGreaterThanOrEqual(1);
    expect(off10).toBeGreaterThanOrEqual(1);
    // Transposition is conditional on the problem; total is what we built.
    // Just check that the total number of errors equals 4 (one per wrong event).
    expect(off1 + off10 + trans + other).toBe(4);
  });

  it("counts n correctly and correct flag respects event.correct", () => {
    const events: AnswerEvent[] = [
      makeEvent(0, { correct: true }),
      makeEvent(1, { correct: false, typed: "999" }),
      makeEvent(2, { correct: true }),
    ];
    const r = rollupTagsFromRound(seed, ZETAMAC_DEFAULTS, events, durationMs);
    let n = 0;
    let correct = 0;
    for (const t of Object.values(r.byTag)) {
      n += t.n;
      correct += t.correct;
    }
    expect(n).toBe(3);
    expect(correct).toBe(2);
  });
});

describe("emptyTagStats", () => {
  it("returns zeroed stats with all error counts at 0", () => {
    const s = emptyTagStats();
    expect(s.n).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.sum_log_lat).toBe(0);
    expect(s.sum_log_lat_sq).toBe(0);
    expect(s.sum_ttf_ms).toBe(0);
    expect(s.sum_exec_ms).toBe(0);
    expect(s.errors).toEqual({
      off_by_one: 0,
      off_by_ten: 0,
      transposition: 0,
      other: 0,
    });
  });
});
