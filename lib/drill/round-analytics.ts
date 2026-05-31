/**
 * Per-round analytics — pure helpers consumed by the storage rollup at save
 * time. No imports beyond the engine types and tag derivation.
 *
 * - `firstKeystrokeT` — recognition signal (time to first digit pressed)
 * - `classifyError`   — error-pattern classifier on misses
 * - `rollupTagsFromRound` — walks events, applies late-round fatigue filter,
 *   accumulates per-tag stats triples (n, correct, log-latency sums, TTF/exec
 *   sums, error counts) using single-attribution per problem.
 */

import type { GeneratorConfig } from "./config";
import { generateProblem } from "./generator";
import { hashString } from "./rng";
import { TAG_VERSION, deriveTags, type TagKey } from "./derive-tags";
import type { AnswerEvent, Keystroke } from "./types";

/** Drop events submitted in the last 10s of the round — they're rushed. */
export const FATIGUE_TAIL_MS = 10_000;

export type ErrorKind = "off_by_one" | "off_by_ten" | "transposition" | "other";

export type TagStats = {
  n: number;
  correct: number;
  sum_log_lat: number;
  sum_log_lat_sq: number;
  sum_ttf_ms: number;
  sum_exec_ms: number;
  errors: {
    off_by_one: number;
    off_by_ten: number;
    transposition: number;
    other: number;
  };
};

export type TagRollup = {
  byTag: Record<string, TagStats>;
  /** TAG_VERSION at rollup time — pinned to the row so future taxonomy bumps can filter. */
  tagVersion: number;
};

export function emptyTagStats(): TagStats {
  return {
    n: 0,
    correct: 0,
    sum_log_lat: 0,
    sum_log_lat_sq: 0,
    sum_ttf_ms: 0,
    sum_exec_ms: 0,
    errors: { off_by_one: 0, off_by_ten: 0, transposition: 0, other: 0 },
  };
}

// ============================================================================
// firstKeystrokeT — recognition latency
// ============================================================================

/**
 * Time of the first digit keystroke for an event. Backspace, Enter, Tab,
 * and any other non-digit keys are ignored. Returns null when no digit was
 * ever pressed (skipped events).
 */
export function firstKeystrokeT(keystrokes: Keystroke[]): number | null {
  for (const k of keystrokes) {
    if (/^\d$/.test(k.key)) return k.t;
  }
  return null;
}

// ============================================================================
// classifyError — error-pattern classifier on misses
// ============================================================================

/**
 * Returns null if `typed` already equals the correct answer (no error).
 * Otherwise classifies into one of:
 *   - off_by_one    abs(typed - correct) === 1
 *   - off_by_ten    abs(typed - correct) === 10
 *   - transposition same digits, different order, length ≥ 2
 *   - other         everything else, plus unparseable input
 */
export function classifyError(
  typed: string,
  correct: number,
): ErrorKind | null {
  if (!typed || typed === String(correct)) return null;
  const n = Number.parseInt(typed, 10);
  if (!Number.isFinite(n)) return "other";
  if (n === correct) return null;
  const diff = Math.abs(n - correct);
  if (diff === 1) return "off_by_one";
  if (diff === 10) return "off_by_ten";
  const aStr = String(n);
  const bStr = String(correct);
  if (aStr.length >= 2 && aStr.length === bStr.length) {
    const sortedA = [...aStr].sort().join("");
    const sortedB = [...bStr].sort().join("");
    if (sortedA === sortedB && aStr !== bStr) return "transposition";
  }
  return "other";
}

// ============================================================================
// rollupTagsFromRound — the per-round tag accumulator
// ============================================================================

function parseProblemIndex(problemId: string): number {
  const m = problemId.match(/^p(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Walk an event array and produce the per-tag stats for the round.
 *
 * Late-round fatigue filter: events with `submittedAt > durationMs - 10000ms`
 * are dropped from per-tag attribution. They still count for the round-level
 * score and accuracy in the storage layer — only per-tag latencies stay
 * uncontaminated by end-of-round rushing.
 *
 * Single-attribution: each event contributes to exactly one tag's `n` per
 * `deriveTags` precedence (pattern wins over skill).
 *
 * Returns a `TagRollup` whose `byTag` is keyed by the attribution `TagKey`.
 */
export function rollupTagsFromRound(
  seed: string,
  generatorConfig: GeneratorConfig,
  events: AnswerEvent[],
  durationMs: number,
): TagRollup {
  const seedHash = hashString(seed);
  // Don't let the fatigue tail swallow the whole round. On short custom
  // durations a flat 10s tail drops every event (a 5s round has cutoff
  // -5000), so Learn never gets data. Cap the tail at 20% of the round; for
  // the default 120s round 20% (24s) exceeds 10s, so standard behavior is
  // unchanged.
  const tail = Math.min(FATIGUE_TAIL_MS, Math.floor(durationMs * 0.2));
  const cutoff = durationMs - tail;
  const byTag: Record<string, TagStats> = {};

  for (const event of events) {
    if (event.submittedAt > cutoff) continue;
    const idx = parseProblemIndex(event.problemId);
    if (idx < 0) continue;

    const problem = generateProblem(seedHash, idx, generatorConfig);
    const tags = deriveTags(problem.a, problem.b, problem.op);
    const tag: TagKey = tags.attribution;

    if (!byTag[tag]) byTag[tag] = emptyTagStats();
    const s = byTag[tag];

    s.n += 1;
    if (event.correct) s.correct += 1;

    // Log-transform the latency to handle right-skew. Floor at 1ms so we
    // never take ln(0) on a degenerate zero-latency event (shouldn't happen
    // but defensive).
    const lat = Math.max(event.latencyMs, 1);
    const logLat = Math.log(lat);
    s.sum_log_lat += logLat;
    s.sum_log_lat_sq += logLat * logLat;

    // TTF (recognition) + execution split. If no digit was ever pressed —
    // event was skipped via Tab — contribute 0 to both sums. The diagnostic
    // ignores those events for the recognition/execution analysis but they
    // still count in n/correct.
    const ttf = firstKeystrokeT(event.keystrokes);
    if (ttf !== null) {
      s.sum_ttf_ms += ttf;
      s.sum_exec_ms += Math.max(0, event.latencyMs - ttf);
    }

    // Classify wrong answers into error kinds. The correct answer comes
    // from the regenerated problem.
    if (!event.correct) {
      const kind = classifyError(event.typed, problem.answer);
      if (kind) s.errors[kind] += 1;
    }
  }

  return { byTag, tagVersion: TAG_VERSION };
}
