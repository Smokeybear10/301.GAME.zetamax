import { describe, expect, it } from "vitest";
import { validateRun } from "../validate";
import type { AnswerEvent } from "../types";

function ev(opts: Partial<AnswerEvent> & { problemId: string; typed: string }): AnswerEvent {
  return {
    problemId: opts.problemId,
    typed: opts.typed,
    keystrokes: opts.keystrokes ?? [],
    submittedAt: opts.submittedAt ?? 0,
    correct: opts.correct ?? false,
    latencyMs: opts.latencyMs ?? 800,
    corrections: opts.corrections ?? 0,
  };
}

describe("validateRun", () => {
  const baseInput = {
    answerKey: [42, 100, 7, 88, 13],
    events: [] as AnswerEvent[],
    startedAtMs: 0,
    completedAtMs: 120_000,
  };

  it("scores correct answers and ignores client-claimed correctness", () => {
    const result = validateRun({
      ...baseInput,
      events: [
        ev({ problemId: "p0", typed: "42", correct: true }),  // matches
        ev({ problemId: "p1", typed: "99", correct: true }),  // CLIENT LIES; server rejects
        ev({ problemId: "p2", typed: "7", correct: true }),   // matches (single digit)
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.score).toBe(2);
    expect(result.problemsAttempted).toBe(3);
  });

  it("rejects rounds shorter than durationMs - tolerance (anti-cheat: fast-submit)", () => {
    const result = validateRun({
      ...baseInput,
      completedAtMs: 60_000, // only 60s elapsed; round must be at least 118s
      events: [ev({ problemId: "p0", typed: "42" })],
    });
    expect(result.status).toBe("rejected_wallclock");
    expect(result.score).toBe(0);
  });

  it("rejects stale run resubmission (>30min after start)", () => {
    const result = validateRun({
      ...baseInput,
      completedAtMs: 60 * 60 * 1000, // 1 hour after start
      events: [ev({ problemId: "p0", typed: "42" })],
    });
    expect(result.status).toBe("rejected_wallclock");
  });

  it("accepts wall-clock at exactly durationMs", () => {
    const result = validateRun({
      ...baseInput,
      completedAtMs: 120_000,
      events: [ev({ problemId: "p0", typed: "42" })],
    });
    expect(result.status).toBe("ok");
  });

  it("accepts long idle before drill started (real-world UX)", () => {
    // User loaded page, idled 5 minutes, then drilled for 120s.
    // Server-side wallclock = 5min + 120s = 420s. Should pass.
    const result = validateRun({
      ...baseInput,
      completedAtMs: 7 * 60 * 1000,
      events: [ev({ problemId: "p0", typed: "42" })],
    });
    expect(result.status).toBe("ok");
  });

  it("rejects on suspiciously fast median latency for multi-digit answers", () => {
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(ev({ problemId: "p0", typed: "42", latencyMs: 50 }));
    }
    const result = validateRun({ ...baseInput, events });
    expect(result.status).toBe("rejected_latency");
  });

  it("does not reject single-digit-only fast answers", () => {
    // p2 has answer 7 (single digit). 50ms median is plausible for single-digit.
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(ev({ problemId: "p2", typed: "7", latencyMs: 50 }));
    }
    const result = validateRun({ ...baseInput, events });
    expect(result.status).toBe("ok");
  });

  it("rejects on streak of >5 sub-100ms answers", () => {
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(ev({ problemId: `p${i}`, typed: "x", latencyMs: 50 }));
    }
    const result = validateRun({ ...baseInput, events });
    expect(result.status).toBe("rejected_streak");
  });

  it("accepts a streak that resets between fast answers", () => {
    const events: AnswerEvent[] = [];
    for (let i = 0; i < 4; i++) {
      events.push(ev({ problemId: `p${i}`, typed: "x", latencyMs: 50 }));
    }
    events.push(ev({ problemId: "p4", typed: "x", latencyMs: 800 })); // resets
    for (let i = 5; i < 9; i++) {
      events.push(ev({ problemId: `p${i}`, typed: "x", latencyMs: 50 }));
    }
    const result = validateRun({ ...baseInput, events });
    expect(result.status).toBe("ok");
  });

  it("ignores events with unknown problemId", () => {
    const result = validateRun({
      ...baseInput,
      events: [
        ev({ problemId: "garbage", typed: "42" }),
        ev({ problemId: "p999", typed: "42" }),
        ev({ problemId: "p0", typed: "42" }),
      ],
    });
    expect(result.score).toBe(1);
    expect(result.problemsAttempted).toBe(3);
  });
});
