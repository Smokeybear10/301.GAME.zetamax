import { describe, expect, it } from "vitest";
import { createDrill } from "../engine";

function mockClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

function typeAnswer(drill: ReturnType<typeof createDrill>, n: number): void {
  for (const d of String(n)) drill.handleKeystroke(d);
}

describe("createDrill — basics", () => {
  it("starts in idle state", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    expect(drill.getState().status).toBe("idle");
    expect(drill.getState().score).toBe(0);
    expect(drill.getState().currentProblem).toBeNull();
  });

  it("transitions to running after start()", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    expect(drill.getState().status).toBe("running");
    expect(drill.getState().currentProblem).not.toBeNull();
    expect(drill.getState().currentProblemIndex).toBe(0);
  });

  it("ignores start() if not idle", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    const stateBefore = drill.getState();
    drill.start();
    expect(drill.getState().currentProblem).toEqual(stateBefore.currentProblem);
  });
});

describe("createDrill — input", () => {
  it("auto-submits on exact match and advances to next problem", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    const problem = drill.getState().currentProblem!;
    typeAnswer(drill, problem.answer);
    expect(drill.getState().score).toBe(1);
    expect(drill.getState().currentProblemIndex).toBe(1);
    expect(drill.getState().typedAnswer).toBe("");
  });

  it("does not auto-submit on a partial typed answer", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    const problem = drill.getState().currentProblem!;
    const answer = String(problem.answer);
    if (answer.length < 2) {
      // Single-digit answer auto-submits on the first digit. Skip this assertion path.
      return;
    }
    drill.handleKeystroke(answer[0]);
    expect(drill.getState().score).toBe(0);
    expect(drill.getState().currentProblemIndex).toBe(0);
    expect(drill.getState().typedAnswer).toBe(answer[0]);
  });

  it("Enter manually submits and counts wrong on mismatch", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    drill.handleKeystroke("9");
    drill.handleKeystroke("9");
    drill.handleKeystroke("9");
    drill.handleKeystroke("9");
    drill.handleKeystroke("Enter");
    expect(drill.getState().score).toBe(0);
    expect(drill.getState().events.length).toBe(1);
    expect(drill.getState().events[0].correct).toBe(false);
    expect(drill.getState().currentProblemIndex).toBe(1);
  });

  it("Tab skips the current problem and counts wrong", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    drill.handleKeystroke("Tab");
    expect(drill.getState().events.length).toBe(1);
    expect(drill.getState().events[0].correct).toBe(false);
    expect(drill.getState().currentProblemIndex).toBe(1);
  });

  it("Backspace removes the last typed digit", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    drill.handleKeystroke("5");
    drill.handleKeystroke("6");
    drill.handleKeystroke("Backspace");
    expect(drill.getState().typedAnswer).toBe("5");
  });

  it("ignores unrecognized keys", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    drill.handleKeystroke("a");
    drill.handleKeystroke(" ");
    drill.handleKeystroke("Shift");
    expect(drill.getState().typedAnswer).toBe("");
  });

  it("ignores keystrokes before start", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.handleKeystroke("5");
    expect(drill.getState().typedAnswer).toBe("");
    expect(drill.getState().status).toBe("idle");
  });
});

describe("createDrill — timing", () => {
  it("ends after durationMs and rejects further input", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", durationMs: 1000, now: clock.now });
    drill.start();
    clock.advance(1500);
    drill.tick();
    expect(drill.getState().status).toBe("ended");
    drill.handleKeystroke("5");
    expect(drill.getState().typedAnswer).toBe("");
  });

  it("msRemaining ticks down with the clock", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", durationMs: 10_000, now: clock.now });
    drill.start();
    expect(drill.getState().msRemaining).toBe(10_000);
    clock.advance(3000);
    expect(drill.getState().msRemaining).toBe(7000);
    clock.advance(20_000);
    expect(drill.getState().msRemaining).toBe(0);
  });

  it("records latency relative to problem-shown time", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    clock.advance(500);
    drill.handleKeystroke("Tab");
    const event = drill.getState().events[0];
    expect(event.latencyMs).toBe(500);
  });
});

describe("createDrill — results", () => {
  it("end() returns a RoundResult with stats", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    drill.handleKeystroke("Tab"); // wrong
    const problem = drill.getState().currentProblem!;
    typeAnswer(drill, problem.answer); // correct
    clock.advance(120_000);
    const result = drill.end();
    expect(result.problemsAttempted).toBe(2);
    expect(result.problemsCorrect).toBe(1);
    expect(result.accuracy).toBe(0.5);
    expect(result.score).toBe(1);
  });

  it("end() is idempotent", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    drill.start();
    const r1 = drill.end();
    const r2 = drill.end();
    expect(r1).toEqual(r2);
  });
});

describe("createDrill — subscriptions", () => {
  it("subscribe receives updates on each transition", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    let count = 0;
    drill.subscribe(() => {
      count++;
    });
    drill.start();
    drill.handleKeystroke("5");
    expect(count).toBeGreaterThan(0);
  });

  it("unsubscribe stops further updates", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "test", now: clock.now });
    let count = 0;
    const unsub = drill.subscribe(() => {
      count++;
    });
    drill.start();
    const before = count;
    unsub();
    drill.handleKeystroke("5");
    expect(count).toBe(before);
  });
});

describe("createDrill — determinism", () => {
  it("same seed produces same problem stream across two drills", () => {
    const c1 = mockClock();
    const c2 = mockClock();
    const d1 = createDrill({ seed: "abc", now: c1.now });
    const d2 = createDrill({ seed: "abc", now: c2.now });
    d1.start();
    d2.start();
    for (let i = 0; i < 10; i++) {
      const p1 = d1.getState().currentProblem;
      const p2 = d2.getState().currentProblem;
      expect(p1).toEqual(p2);
      d1.handleKeystroke("Tab");
      d2.handleKeystroke("Tab");
    }
  });
});

describe("createDrill — count termination", () => {
  it("ends after targetCount correct answers", () => {
    const clock = mockClock();
    const drill = createDrill({
      seed: "count-mode",
      now: clock.now,
      durationMs: 600_000,
      terminationMode: "count",
      targetCount: 3,
    });
    drill.start();
    expect(drill.getState().status).toBe("running");

    // Answer the first 3 problems correctly. Engine should end on the 3rd.
    for (let i = 0; i < 3; i++) {
      const p = drill.getState().currentProblem;
      expect(p, `problem ${i} should exist`).not.toBeNull();
      typeAnswer(drill, p!.answer);
    }
    expect(drill.getState().status).toBe("ended");
    expect(drill.getState().score).toBe(3);

    const result = drill.end();
    expect(result.score).toBe(3);
    expect(result.problemsAttempted).toBe(3);
  });

  it("does not end early on wrong answers in count mode", () => {
    const clock = mockClock();
    const drill = createDrill({
      seed: "count-mode-wrongs",
      now: clock.now,
      durationMs: 600_000,
      terminationMode: "count",
      targetCount: 2,
    });
    drill.start();

    // Answer one correctly, then submit a wrong answer (Enter).
    typeAnswer(drill, drill.getState().currentProblem!.answer);
    expect(drill.getState().score).toBe(1);
    expect(drill.getState().status).toBe("running");

    drill.handleKeystroke("0");
    drill.handleKeystroke("Enter");
    expect(drill.getState().score).toBe(1); // unchanged
    expect(drill.getState().status).toBe("running"); // no termination

    // Final correct answer triggers termination.
    typeAnswer(drill, drill.getState().currentProblem!.answer);
    expect(drill.getState().score).toBe(2);
    expect(drill.getState().status).toBe("ended");
  });

  it("respects time cap in count mode (forfeit on cap hit)", () => {
    const clock = mockClock();
    const drill = createDrill({
      seed: "cap-test",
      now: clock.now,
      durationMs: 60_000,
      terminationMode: "count",
      targetCount: 50,
    });
    drill.start();

    typeAnswer(drill, drill.getState().currentProblem!.answer);
    expect(drill.getState().score).toBe(1);

    clock.advance(60_001);
    drill.tick();
    expect(drill.getState().status).toBe("ended");
    expect(drill.getState().score).toBe(1); // far short of targetCount
  });
});

describe("createDrill — disableSkip", () => {
  it("ignores Tab when disableSkip is true", () => {
    const clock = mockClock();
    const drill = createDrill({
      seed: "no-skip",
      now: clock.now,
      durationMs: 600_000,
      disableSkip: true,
    });
    drill.start();
    const before = drill.getState().currentProblem;
    drill.handleKeystroke("Tab");
    const after = drill.getState().currentProblem;
    expect(after).toEqual(before); // problem hasn't advanced
    expect(drill.getState().score).toBe(0);
    expect(drill.getState().events.length).toBe(0); // no skip event recorded
  });

  it("ignores Enter when typed answer is wrong", () => {
    const clock = mockClock();
    const drill = createDrill({
      seed: "no-give-up",
      now: clock.now,
      durationMs: 600_000,
      disableSkip: true,
    });
    drill.start();
    const correct = drill.getState().currentProblem!.answer;
    const wrong = correct + 1;

    for (const d of String(wrong)) drill.handleKeystroke(d);
    drill.handleKeystroke("Enter");

    // No advance: problem is the same, no events recorded.
    expect(drill.getState().currentProblem!.answer).toBe(correct);
    expect(drill.getState().events.length).toBe(0);
    expect(drill.getState().typedAnswer).toBe(String(wrong)); // typed preserved

    // User backspaces and types correct → auto-commits.
    for (let i = 0; i < String(wrong).length; i++) drill.handleKeystroke("Backspace");
    typeAnswer(drill, correct);
    expect(drill.getState().score).toBe(1);
    expect(drill.getState().events.length).toBe(1);
  });

  it("Tab still works normally when disableSkip is false (default)", () => {
    const clock = mockClock();
    const drill = createDrill({ seed: "default-skip", now: clock.now });
    drill.start();
    drill.handleKeystroke("Tab");
    expect(drill.getState().events.length).toBe(1);
    expect(drill.getState().events[0].correct).toBe(false);
  });
});
