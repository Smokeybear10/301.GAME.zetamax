import type {
  AnswerEvent,
  DrillConfig,
  DrillState,
  Keystroke,
  RoundResult,
} from "./types";
import { KEYBIND_DEFAULTS, ZETAMAC_DEFAULTS, maxAnswerDigits } from "./config";
import { generateProblem } from "./generator";
import { hashString } from "./rng";

const DEFAULT_DURATION_MS = 120_000;

const defaultNow = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

export type Drill = {
  /** Snapshot of the current state, with msRemaining computed against now(). */
  getState(): DrillState;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: DrillState) => void): () => void;
  /** Begin the round. No-op if not idle. */
  start(): void;
  /** Process a keystroke. Recognized: digits, "Backspace", "Enter", "Tab". Others ignored. */
  handleKeystroke(key: string): void;
  /** Drives the timer when no keys are pressed. Caller (rAF loop) should invoke. */
  tick(): void;
  /** Force-end the round and return the result. Idempotent. */
  end(): RoundResult;
};

export function createDrill(config: DrillConfig): Drill {
  const durationMs = config.durationMs ?? DEFAULT_DURATION_MS;
  const now = config.now ?? defaultNow;
  const seedHash = hashString(config.seed);
  const generatorConfig = config.generatorConfig ?? ZETAMAC_DEFAULTS;
  const maxDigits = maxAnswerDigits(generatorConfig);
  const keybinds = config.keybinds ?? KEYBIND_DEFAULTS;
  const terminationMode = config.terminationMode ?? "time";
  const targetCount = config.targetCount ?? Infinity;
  const disableSkip = config.disableSkip ?? false;

  const subs = new Set<(state: DrillState) => void>();

  const internal = {
    status: "idle" as DrillState["status"],
    startedAt: null as number | null,
    endsAt: null as number | null,
    currentProblemIndex: 0,
    currentProblem: null as DrillState["currentProblem"],
    currentProblemShownAt: null as number | null,
    typedAnswer: "",
    currentKeystrokes: [] as Keystroke[],
    events: [] as AnswerEvent[],
    score: 0,
  };

  function snapshot(): DrillState {
    const t = now();
    const msRemaining =
      internal.endsAt === null ? durationMs : Math.max(0, internal.endsAt - t);
    return {
      status: internal.status,
      startedAt: internal.startedAt,
      endsAt: internal.endsAt,
      durationMs,
      currentProblemIndex: internal.currentProblemIndex,
      currentProblem: internal.currentProblem,
      currentProblemShownAt: internal.currentProblemShownAt,
      typedAnswer: internal.typedAnswer,
      events: internal.events,
      score: internal.score,
      msRemaining,
    };
  }

  function notify(): void {
    if (subs.size === 0) return;
    const state = snapshot();
    subs.forEach((fn) => fn(state));
  }

  function loadProblem(index: number): void {
    internal.currentProblem = generateProblem(seedHash, index, generatorConfig);
    internal.currentProblemIndex = index;
    internal.currentProblemShownAt = now();
    internal.typedAnswer = "";
    internal.currentKeystrokes = [];
  }

  function commit(correct: boolean): void {
    const t = now();
    const event: AnswerEvent = {
      problemId: internal.currentProblem!.id,
      typed: internal.typedAnswer,
      keystrokes: internal.currentKeystrokes,
      submittedAt: t - internal.startedAt!,
      correct,
      latencyMs: t - internal.currentProblemShownAt!,
      corrections: internal.currentKeystrokes.filter((k) => k.key === "Backspace").length,
    };
    internal.events.push(event);
    if (correct) internal.score++;
    // Count-mode terminator: end the round as soon as the target is hit.
    if (terminationMode === "count" && internal.score >= targetCount) {
      endInternal();
      return;
    }
    loadProblem(internal.currentProblemIndex + 1);
  }

  function buildResult(): RoundResult {
    const events = internal.events;
    const correct = events.filter((e) => e.correct).length;
    return {
      score: internal.score,
      problemsAttempted: events.length,
      problemsCorrect: correct,
      accuracy: events.length > 0 ? correct / events.length : 0,
      meanLatencyMs:
        events.length > 0
          ? events.reduce((sum, e) => sum + e.latencyMs, 0) / events.length
          : 0,
      events,
    };
  }

  function endInternal(): RoundResult {
    if (internal.status !== "ended") {
      internal.status = "ended";
      notify();
    }
    return buildResult();
  }

  return {
    getState: snapshot,

    subscribe(listener) {
      subs.add(listener);
      return () => {
        subs.delete(listener);
      };
    },

    start() {
      if (internal.status !== "idle") return;
      internal.startedAt = now();
      internal.endsAt = internal.startedAt + durationMs;
      internal.status = "running";
      loadProblem(0);
      notify();
    },

    handleKeystroke(key) {
      if (internal.status !== "running") return;

      // Time check first — if elapsed, drop the input and end.
      if (now() >= internal.endsAt!) {
        endInternal();
        return;
      }

      const t = now() - internal.currentProblemShownAt!;

      if (key === keybinds.delete) {
        internal.currentKeystrokes.push({ key, t });
        internal.typedAnswer = internal.typedAnswer.slice(0, -1);
        notify();
        return;
      }

      if (key === keybinds.submit) {
        const correct =
          internal.typedAnswer === String(internal.currentProblem!.answer);
        // disableSkip: Enter on a wrong answer is ignored. Auto-commit on
        // correct typing already advances; this just blocks the "give up"
        // shortcut so the user must finish the current problem.
        if (disableSkip && !correct) {
          return;
        }
        internal.currentKeystrokes.push({ key, t });
        commit(correct);
        notify();
        return;
      }

      if (key === keybinds.skip) {
        if (disableSkip) {
          return;
        }
        internal.currentKeystrokes.push({ key, t });
        commit(false);
        notify();
        return;
      }

      if (/^\d$/.test(key)) {
        if (internal.typedAnswer.length >= maxDigits) return;
        internal.currentKeystrokes.push({ key, t });
        internal.typedAnswer += key;
        if (internal.typedAnswer === String(internal.currentProblem!.answer)) {
          commit(true);
        }
        notify();
        return;
      }

      // Unknown key — ignore silently. No notify, no log.
    },

    tick() {
      if (internal.status !== "running") return;
      if (now() >= internal.endsAt!) {
        endInternal();
      }
    },

    end() {
      return endInternal();
    },
  };
}
