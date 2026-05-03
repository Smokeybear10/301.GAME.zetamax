import type { AnswerEvent } from "./types";

const DEFAULT_DURATION_MS = 120_000;
const DURATION_TOLERANCE_MS = 2_000;
const MAX_STALE_RUN_MS = 30 * 60 * 1000; // 30 min — anything older is presumed stale/abandoned
const MIN_MEDIAN_LATENCY_MS = 200;
const MIN_LATENCY_FLOOR_MS = 100;
const MAX_FAST_STREAK = 5;

export type ValidationStatus =
  | "ok"
  | "rejected_score_mismatch"
  | "rejected_latency"
  | "rejected_wallclock"
  | "rejected_streak";

export type ValidationResult = {
  status: ValidationStatus;
  score: number;
  problemsAttempted: number;
  problemsCorrect: number;
  durationMs: number;
};

export type ValidationInput = {
  /** Server-stored answer_key (one entry per problem index). */
  answerKey: number[];
  /** Client-submitted answer events. */
  events: AnswerEvent[];
  /** Server's idea of when the round started (runs.started_at as ms). */
  startedAtMs: number;
  /** Server's now() at /api/runs/finish. */
  completedAtMs: number;
  /** Round duration. Default 120_000. */
  durationMs?: number;
};

/**
 * Server-side run validation. The client's `event.correct` field is IGNORED;
 * we recompute correctness against `answerKey`. The client's claimed score
 * is also ignored — the only score that matters is what we compute here.
 *
 * Sanity gates (in order):
 *   1. wall-clock window: `completedAt - startedAt` within `durationMs ± 2s`
 *   2. score: count events whose `typed` matches `answerKey[problemIndex]`
 *   3. latency floor: median latency on multi-digit answers > 200ms
 *   4. streak: no run of >5 consecutive answers <100ms apart
 */
export function validateRun(input: ValidationInput): ValidationResult {
  const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
  const wallClockMs = input.completedAtMs - input.startedAtMs;
  const events = input.events;

  // 1. wall-clock: drill must have run AT LEAST durationMs - 2s (so a fast bot
  // can't claim a full round). Idle time before first keystroke is fine — the
  // user might pause to read or grab coffee. Cap at MAX_STALE_RUN_MS to reject
  // submissions of long-abandoned runs.
  if (
    wallClockMs < durationMs - DURATION_TOLERANCE_MS ||
    wallClockMs > MAX_STALE_RUN_MS
  ) {
    return failure("rejected_wallclock", events.length, wallClockMs);
  }

  // 2. recomputed score
  let correct = 0;
  for (const event of events) {
    const idx = parseProblemIndex(event.problemId);
    if (idx < 0 || idx >= input.answerKey.length) continue;
    if (event.typed === String(input.answerKey[idx])) correct++;
  }

  // 3. latency floor (multi-digit answers only — single-digit can be <200ms legitimately)
  const multiDigitLatencies = events
    .filter((e) => {
      const idx = parseProblemIndex(e.problemId);
      if (idx < 0 || idx >= input.answerKey.length) return false;
      return String(input.answerKey[idx]).length >= 2;
    })
    .map((e) => e.latencyMs)
    .sort((a, b) => a - b);

  if (multiDigitLatencies.length >= 5) {
    const median = multiDigitLatencies[Math.floor(multiDigitLatencies.length / 2)];
    if (median < MIN_MEDIAN_LATENCY_MS) {
      return failure("rejected_latency", events.length, wallClockMs);
    }
  }

  // 4. streak
  let streak = 0;
  for (const event of events) {
    if (event.latencyMs < MIN_LATENCY_FLOOR_MS) {
      streak++;
      if (streak > MAX_FAST_STREAK) {
        return failure("rejected_streak", events.length, wallClockMs);
      }
    } else {
      streak = 0;
    }
  }

  return {
    status: "ok",
    score: correct,
    problemsAttempted: events.length,
    problemsCorrect: correct,
    durationMs: wallClockMs,
  };
}

function failure(
  status: ValidationStatus,
  problemsAttempted: number,
  durationMs: number,
): ValidationResult {
  return {
    status,
    score: 0,
    problemsAttempted,
    problemsCorrect: 0,
    durationMs,
  };
}

function parseProblemIndex(problemId: string): number {
  const match = problemId.match(/^p(\d+)$/);
  if (!match) return -1;
  return parseInt(match[1], 10);
}
