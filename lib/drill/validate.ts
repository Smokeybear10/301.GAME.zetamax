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
  | "rejected_streak"
  | "rejected_incomplete";

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
  /** Round duration. Default 120_000. In count mode, this is the hard time cap. */
  durationMs?: number;
  /**
   * When set, the run is graded as a fixed-length challenge (Daily v2):
   *   - "ok" requires correct === targetCount AND no skip events.
   *   - Wallclock floor is dropped; the round ends as soon as targetCount is hit.
   *   - Anything short is "rejected_incomplete".
   */
  targetCount?: number;
};

/**
 * Server-side run validation. The client's `event.correct` field is IGNORED;
 * we recompute correctness against `answerKey`. The client's claimed score
 * is also ignored — the only score that matters is what we compute here.
 *
 * Time-mode (default) sanity gates:
 *   1. wall-clock: completedAt - startedAt within `durationMs ± 2s` and below MAX_STALE
 *   2. score: count events whose `typed` matches `answerKey[problemIndex]`
 *   3. latency floor: median latency on multi-digit answers > 200ms
 *   4. streak: no run of >5 consecutive answers <100ms apart
 *
 * Count-mode (`targetCount` set, used by Daily v2):
 *   - Wallclock LOWER bound dropped (rounds end as soon as target hit).
 *   - Wallclock UPPER bound = MAX_STALE.
 *   - Score must equal targetCount and no event may be a skip (`typed === ""`).
 *   - Anything short → "rejected_incomplete".
 *   - Latency + streak checks still apply.
 */
export function validateRun(input: ValidationInput): ValidationResult {
  const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
  const wallClockMs = input.completedAtMs - input.startedAtMs;
  const events = input.events;
  const isCountMode = input.targetCount !== undefined;

  // 1. wall-clock
  if (isCountMode) {
    // Count-mode: only the staleness ceiling matters. The round may end well
    // before durationMs (target hit) or at durationMs (cap, forfeit).
    if (wallClockMs > MAX_STALE_RUN_MS) {
      return failure("rejected_wallclock", events.length, wallClockMs);
    }
  } else {
    // Time-mode: drill must have run AT LEAST durationMs - 2s (anti-bot)
    // and not exceed MAX_STALE_RUN_MS (anti-zombie-tab).
    if (
      wallClockMs < durationMs - DURATION_TOLERANCE_MS ||
      wallClockMs > MAX_STALE_RUN_MS
    ) {
      return failure("rejected_wallclock", events.length, wallClockMs);
    }
  }

  // 2. recomputed score + skip detection
  let correct = 0;
  let skipCount = 0;
  for (const event of events) {
    const idx = parseProblemIndex(event.problemId);
    if (idx < 0 || idx >= input.answerKey.length) continue;
    if (event.typed === String(input.answerKey[idx])) correct++;
    if (event.typed === "") skipCount++;
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

  // 5. count-mode completeness: must hit target AND no skips slipped through
  if (isCountMode) {
    if (skipCount > 0 || correct < input.targetCount!) {
      return failure("rejected_incomplete", events.length, wallClockMs);
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
