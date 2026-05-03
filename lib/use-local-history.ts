"use client";

import type { GeneratorConfig, RoundResult } from "@/lib/drill";
import {
  emptyByOp,
  emptyTriple,
  rollupRoundResult,
  type ByOpStats,
  type MulFactsStats,
  type PracticeMode,
  type RunRow,
} from "@/lib/practice-stats";

const VALID_MODES: ReadonlySet<PracticeMode> = new Set([
  "classic",
  "quant",
  "compound",
  "weakness",
]);

function coerceMode(raw: unknown): PracticeMode {
  return typeof raw === "string" && VALID_MODES.has(raw as PracticeMode)
    ? (raw as PracticeMode)
    : "classic";
}

/**
 * Practice-mode round history, stored in localStorage.
 *
 * v2 schema captures per-op stats and the canonicalized 2..12 mul-fact map
 * per run, computed at save time. Cross-run aggregation is then trivial
 * (additive over {n, correct, sumLatencyMs} triples). The v1 schema (just
 * score/accuracy/latency aggregates) is migrated forward on first read.
 *
 * Cap of 1000 stored runs is well under localStorage's ~5MB practical
 * budget (~1KB/run), and well over what a single user will ever drill in
 * a v1 lifetime. Older runs are pruned silently.
 */

const STORAGE_KEY_V1 = "zetamax:practice-history";
const STORAGE_KEY = "zetamax:practice-history-v2";
const MAX_STORED = 1000;

export type StoredRun = RunRow;

/** Backward-compat type used by callers that pre-date v2 (kept for clarity). */
export type LocalStats = {
  todayBest: number;
  lifetimeBest: number;
  totalRuns: number;
};

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

type V1Run = {
  score: number;
  problemsAttempted: number;
  accuracy: number;
  meanLatencyMs: number;
  endedAt: number;
};

function isV1Run(x: unknown): x is V1Run {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.score === "number" &&
    typeof o.problemsAttempted === "number" &&
    typeof o.endedAt === "number"
  );
}

function v1ToV2(r: V1Run): StoredRun {
  return {
    v: 2,
    mode: "classic", // v1 only had one mode
    score: r.score,
    problemsAttempted: r.problemsAttempted,
    // v1 didn't track problemsCorrect; score == correct in practice mode.
    problemsCorrect: r.score,
    meanLatencyMs: r.meanLatencyMs,
    durationMs: 120_000, // unknown — assume Zetamac default
    endedAt: r.endedAt,
    byOp: emptyByOp(),
    mulFacts: {},
  };
}

/**
 * One-shot v1 → v2 migration. Idempotent: if v2 already has rows, the v1 key
 * is dropped without re-importing (assume migration already ran in a prior
 * session). Failures are silent — leaving both keys alone is safer than
 * tearing down user data on a transient parse error.
 */
function migrateV1IfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    const v1Raw = window.localStorage.getItem(STORAGE_KEY_V1);
    if (!v1Raw) return;

    const v2Raw = window.localStorage.getItem(STORAGE_KEY);
    if (v2Raw) {
      // Already migrated in a prior session.
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }

    const parsed = JSON.parse(v1Raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }
    const migrated: StoredRun[] = parsed.filter(isV1Run).map(v1ToV2);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // parse failure or QuotaExceeded — bail quietly, keep both keys.
  }
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function isStoredRun(x: unknown): x is StoredRun {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 2 &&
    typeof o.score === "number" &&
    typeof o.endedAt === "number" &&
    typeof o.byOp === "object" &&
    o.byOp !== null
  );
}

/**
 * Normalize a row read off disk — fills in any missing v2 sub-fields with
 * zeroed defaults. Defensive against future schema bumps and against
 * partial writes from earlier dev builds.
 */
function normalizeRun(raw: unknown): StoredRun | null {
  if (!isStoredRun(raw)) return null;
  const o = raw as Partial<StoredRun> & StoredRun;
  const byOp: ByOpStats = {
    add: o.byOp?.add ?? emptyTriple(),
    sub: o.byOp?.sub ?? emptyTriple(),
    mul: o.byOp?.mul ?? emptyTriple(),
    div: o.byOp?.div ?? emptyTriple(),
  };
  const mulFacts: MulFactsStats = o.mulFacts ?? {};
  return {
    v: 2,
    mode: coerceMode(o.mode),
    score: o.score,
    problemsAttempted: o.problemsAttempted ?? 0,
    problemsCorrect: o.problemsCorrect ?? o.score,
    meanLatencyMs: o.meanLatencyMs ?? 0,
    durationMs: o.durationMs ?? 120_000,
    endedAt: o.endedAt,
    byOp,
    mulFacts,
  };
}

function readHistoryRaw(): StoredRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRun).filter((r): r is StoredRun => r !== null);
  } catch {
    return [];
  }
}

function writeHistory(history: StoredRun[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history.slice(-MAX_STORED)),
    );
  } catch {
    // QuotaExceededError, private browsing — silent drop is fine.
  }
}

/** Read the full v2 history. Triggers v1 → v2 migration on first call. */
export function getHistory(): StoredRun[] {
  migrateV1IfNeeded();
  return readHistoryRaw();
}

/**
 * Persist a single round. Computes the per-op + mul-fact rollup at save time
 * (cheap — re-derives ~80 problems from the seed). Returns the stored row.
 *
 * v2 (deferred per TODOS.md): also call deriveTags(a, b, op) here and
 * persist a patternTags rollup on the row.
 */
export function saveRun(
  mode: PracticeMode,
  seed: string,
  generatorConfig: GeneratorConfig,
  result: RoundResult,
): StoredRun {
  const rollup = rollupRoundResult(seed, generatorConfig, result);
  const stored: StoredRun = {
    v: 2,
    mode,
    score: result.score,
    problemsAttempted: result.problemsAttempted,
    problemsCorrect: rollup.problemsCorrect,
    meanLatencyMs: result.meanLatencyMs,
    durationMs: 120_000,
    endedAt: Date.now(),
    byOp: rollup.byOp,
    mulFacts: rollup.mulFacts,
  };
  const next = [...getHistory(), stored];
  writeHistory(next);
  return stored;
}

/** Wipe the v2 history. Used by the "Reset all stats" affordance. */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // unreachable in practice; removeItem can't QuotaExceed.
  }
}

// ---------------------------------------------------------------------------
// Backward-compat surface — the post-round summary still calls getStats().
// ---------------------------------------------------------------------------

function isToday(unixMs: number): boolean {
  const d = new Date(unixMs);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function getStats(): LocalStats {
  const history = getHistory();
  const todayBest = history
    .filter((r) => isToday(r.endedAt))
    .reduce((max, r) => Math.max(max, r.score), 0);
  const lifetimeBest = history.reduce((max, r) => Math.max(max, r.score), 0);
  return { todayBest, lifetimeBest, totalRuns: history.length };
}
