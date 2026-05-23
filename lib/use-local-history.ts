"use client";

import type { GeneratorConfig, RoundResult } from "@/lib/drill";
import {
  emptyByOp,
  emptyTriple,
  rollupRoundResult,
  type ByOpStats,
  type MulFactsStats,
  type RunRow,
  type SaveMode,
} from "@/lib/practice-stats";
import { emptyTagStats, type TagStats } from "@/lib/drill/round-analytics";
import {
  isPracticeMode,
  syncPracticeBatch,
  syncPracticeRun,
} from "@/lib/practice-sync";
import { createClient } from "@/lib/supabase/client";

const VALID_MODES: ReadonlySet<SaveMode> = new Set([
  "classic",
  "quant",
  "compound",
  "learn",
  "ranked",
  "daily",
]);

function coerceMode(raw: unknown): SaveMode {
  return typeof raw === "string" && VALID_MODES.has(raw as SaveMode)
    ? (raw as SaveMode)
    : "classic";
}

/**
 * Round-history store. v4 schema captures per-op stats, mul-fact map,
 * per-tag stats (skill + pattern attribution per problem), AND an optional
 * server-issued run id (ranked/daily only — lets the recent-runs list
 * deep-link to `/r/[run_id]`).
 *
 * Migration history:
 *   v1 → v2: dropped key, schema bumped to per-op + mul-facts.
 *   v2 → v3: dropped key, schema bumped to add byTag + tagVersion. Legacy v2
 *           rows migrate forward with byTag={} and tagVersion=0 (invisible
 *           to the diagnostic, still queryable for op/mul-fact stats).
 *   v3 → v4: dropped key, schema bumped to add optional runId. v3 rows
 *           migrate forward with runId=undefined (rendered non-clickable in
 *           recent-runs — no server permalink to point at).
 *
 * Cap: 1000 stored runs (~1KB/run = 1MB, well under the 5MB localStorage
 * budget). Older runs are pruned silently.
 */

const STORAGE_KEY_V1 = "zetamax:practice-history";
const STORAGE_KEY_V2 = "zetamax:practice-history-v2";
const STORAGE_KEY_V3 = "zetamax:practice-history-v3";
const STORAGE_KEY = "zetamax:practice-history-v4";
const MAX_STORED = 1000;
const DEFAULT_DURATION_MS = 120_000;

export type StoredRun = RunRow;

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

function v1ToV4(r: V1Run): StoredRun {
  return {
    v: 4,
    mode: "classic",
    score: r.score,
    problemsAttempted: r.problemsAttempted,
    problemsCorrect: r.score,
    meanLatencyMs: r.meanLatencyMs,
    durationMs: DEFAULT_DURATION_MS,
    endedAt: r.endedAt,
    byOp: emptyByOp(),
    mulFacts: {},
    byTag: {},
    tagVersion: 0,
  };
}

/**
 * v2 row shape — unversioned migration source. Rows look like a v3 row
 * minus byTag and tagVersion. v: 2 marker.
 */
type V2RowShape = {
  v: 2;
  mode?: SaveMode;
  score: number;
  problemsAttempted?: number;
  problemsCorrect?: number;
  meanLatencyMs?: number;
  durationMs?: number;
  endedAt: number;
  byOp?: ByOpStats;
  mulFacts?: MulFactsStats;
};

function isV2RowShape(x: unknown): x is V2RowShape {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 2 &&
    typeof o.score === "number" &&
    typeof o.endedAt === "number"
  );
}

function v2ToV4(r: V2RowShape): StoredRun {
  return {
    v: 4,
    mode: coerceMode(r.mode),
    score: r.score,
    problemsAttempted: r.problemsAttempted ?? 0,
    problemsCorrect: r.problemsCorrect ?? r.score,
    meanLatencyMs: r.meanLatencyMs ?? 0,
    durationMs: r.durationMs ?? DEFAULT_DURATION_MS,
    endedAt: r.endedAt,
    byOp: {
      add: r.byOp?.add ?? emptyTriple(),
      sub: r.byOp?.sub ?? emptyTriple(),
      mul: r.byOp?.mul ?? emptyTriple(),
      div: r.byOp?.div ?? emptyTriple(),
    },
    mulFacts: r.mulFacts ?? {},
    byTag: {},
    tagVersion: 0,
  };
}

/**
 * v3 row shape — current-minus-one. Same fields as v4 except for `v` and
 * the missing `runId`. Walk-forward migration copies through.
 */
type V3RowShape = {
  v: 3;
  mode?: SaveMode;
  score: number;
  problemsAttempted?: number;
  problemsCorrect?: number;
  meanLatencyMs?: number;
  durationMs?: number;
  endedAt: number;
  byOp?: ByOpStats;
  mulFacts?: MulFactsStats;
  byTag?: unknown;
  tagVersion?: number;
};

function isV3RowShape(x: unknown): x is V3RowShape {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 3 &&
    typeof o.score === "number" &&
    typeof o.endedAt === "number"
  );
}

function v3ToV4(r: V3RowShape): StoredRun {
  return {
    v: 4,
    mode: coerceMode(r.mode),
    score: r.score,
    problemsAttempted: r.problemsAttempted ?? 0,
    problemsCorrect: r.problemsCorrect ?? r.score,
    meanLatencyMs: r.meanLatencyMs ?? 0,
    durationMs: r.durationMs ?? DEFAULT_DURATION_MS,
    endedAt: r.endedAt,
    byOp: {
      add: r.byOp?.add ?? emptyTriple(),
      sub: r.byOp?.sub ?? emptyTriple(),
      mul: r.byOp?.mul ?? emptyTriple(),
      div: r.byOp?.div ?? emptyTriple(),
    },
    mulFacts: r.mulFacts ?? {},
    byTag: normalizeByTag(r.byTag),
    tagVersion: typeof r.tagVersion === "number" ? r.tagVersion : 0,
    // runId stays undefined — v3 rows were never linked to a server run id.
  };
}

/**
 * One-shot migration. Idempotent — if the v4 key already exists, older keys
 * are dropped without re-importing. Failures are silent (don't kill user
 * data on a transient parse error).
 *
 * Preference order: v4 wins → v3 → v2 → v1. Each fallback migrates forward
 * to v4 and drops every older key.
 */
function migrateIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    const v4Raw = window.localStorage.getItem(STORAGE_KEY);
    if (v4Raw) {
      // Already on v4. Drop legacy keys if they're hanging around.
      window.localStorage.removeItem(STORAGE_KEY_V3);
      window.localStorage.removeItem(STORAGE_KEY_V2);
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }

    // Prefer v3 → v4 if v3 has data.
    const v3Raw = window.localStorage.getItem(STORAGE_KEY_V3);
    if (v3Raw) {
      try {
        const parsed = JSON.parse(v3Raw);
        if (Array.isArray(parsed)) {
          const migrated = parsed.filter(isV3RowShape).map(v3ToV4);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      } catch {
        // ignore — leave v3 alone, write nothing
      }
      window.localStorage.removeItem(STORAGE_KEY_V3);
      window.localStorage.removeItem(STORAGE_KEY_V2);
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }

    // No v3 — fall back to v2 → v4.
    const v2Raw = window.localStorage.getItem(STORAGE_KEY_V2);
    if (v2Raw) {
      try {
        const parsed = JSON.parse(v2Raw);
        if (Array.isArray(parsed)) {
          const migrated = parsed.filter(isV2RowShape).map(v2ToV4);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      } catch {
        // ignore — leave v2 alone, write nothing
      }
      window.localStorage.removeItem(STORAGE_KEY_V2);
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }

    // No v2 — fall back to v1 → v4.
    const v1Raw = window.localStorage.getItem(STORAGE_KEY_V1);
    if (v1Raw) {
      try {
        const parsed = JSON.parse(v1Raw);
        if (Array.isArray(parsed)) {
          const migrated = parsed.filter(isV1Run).map(v1ToV4);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      } catch {
        // ignore
      }
      window.localStorage.removeItem(STORAGE_KEY_V1);
    }
  } catch {
    // catastrophic — leave everything alone
  }
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function isV4StoredRun(x: unknown): x is StoredRun {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 4 &&
    typeof o.score === "number" &&
    typeof o.endedAt === "number" &&
    typeof o.byOp === "object" &&
    o.byOp !== null
  );
}

function normalizeByTag(raw: unknown): Record<string, TagStats> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, TagStats> = {};
  for (const [tag, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const v = val as Partial<TagStats>;
    const errors = (v.errors ?? {}) as Partial<TagStats["errors"]>;
    out[tag] = {
      n: typeof v.n === "number" ? v.n : 0,
      correct: typeof v.correct === "number" ? v.correct : 0,
      sum_log_lat: typeof v.sum_log_lat === "number" ? v.sum_log_lat : 0,
      sum_log_lat_sq: typeof v.sum_log_lat_sq === "number" ? v.sum_log_lat_sq : 0,
      sum_ttf_ms: typeof v.sum_ttf_ms === "number" ? v.sum_ttf_ms : 0,
      sum_exec_ms: typeof v.sum_exec_ms === "number" ? v.sum_exec_ms : 0,
      errors: {
        off_by_one: typeof errors.off_by_one === "number" ? errors.off_by_one : 0,
        off_by_ten: typeof errors.off_by_ten === "number" ? errors.off_by_ten : 0,
        transposition: typeof errors.transposition === "number" ? errors.transposition : 0,
        other: typeof errors.other === "number" ? errors.other : 0,
      },
    };
  }
  return out;
}

function normalizeRun(raw: unknown): StoredRun | null {
  if (!isV4StoredRun(raw)) return null;
  const o = raw as Partial<StoredRun> & StoredRun;
  return {
    v: 4,
    mode: coerceMode(o.mode),
    score: o.score,
    problemsAttempted: o.problemsAttempted ?? 0,
    problemsCorrect: o.problemsCorrect ?? o.score,
    meanLatencyMs: o.meanLatencyMs ?? 0,
    durationMs: o.durationMs ?? DEFAULT_DURATION_MS,
    endedAt: o.endedAt,
    byOp: {
      add: o.byOp?.add ?? emptyTriple(),
      sub: o.byOp?.sub ?? emptyTriple(),
      mul: o.byOp?.mul ?? emptyTriple(),
      div: o.byOp?.div ?? emptyTriple(),
    },
    mulFacts: o.mulFacts ?? {},
    byTag: normalizeByTag(o.byTag),
    tagVersion: typeof o.tagVersion === "number" ? o.tagVersion : 0,
    runId: typeof o.runId === "string" ? o.runId : undefined,
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

/** Read the full v4 history. Triggers v1/v2/v3 → v4 migration on first call. */
export function getHistory(): StoredRun[] {
  migrateIfNeeded();
  return readHistoryRaw();
}

export type SaveRunOptions = {
  /** Server-issued run id. Ranked/daily pass this so recent-runs can link to /r/[run_id]. */
  runId?: string;
};

/** UUID generator — wraps crypto.randomUUID() with a fallback for ancient browsers. */
function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Very rare fallback. Not cryptographically strong, but uniqueness is
  // good enough for a per-device run id.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Persist a single round. Computes the per-op + mul-fact + per-tag rollup
 * at save time (cheap — re-derives ~80 problems from the seed).
 *
 * `durationMs` should be the round's actual duration so the late-round
 * fatigue filter inside the tag rollup uses the right cutoff.
 *
 * `opts.runId` is the server-issued run id for ranked/daily rows; for
 * practice modes we generate a client-side UUID so the row can be synced
 * (and idempotently re-synced) to /api/practice/sync.
 *
 * For practice rows, this also kicks off a fire-and-forget POST to the
 * sync endpoint when the user is signed in — failures are swallowed and
 * caught up by the next reconcile pass on /me.
 */
export function saveRun(
  mode: SaveMode,
  seed: string,
  generatorConfig: GeneratorConfig,
  result: RoundResult,
  durationMs: number,
  opts: SaveRunOptions = {},
): StoredRun {
  const rollup = rollupRoundResult(seed, generatorConfig, result, durationMs);
  const runId = opts.runId ?? (isPracticeMode(mode) ? makeUuid() : undefined);
  const stored: StoredRun = {
    v: 4,
    mode,
    score: result.score,
    problemsAttempted: result.problemsAttempted,
    problemsCorrect: rollup.problemsCorrect,
    meanLatencyMs: result.meanLatencyMs,
    durationMs,
    endedAt: Date.now(),
    byOp: rollup.byOp,
    mulFacts: rollup.mulFacts,
    byTag: rollup.byTag,
    tagVersion: rollup.tagVersion,
    runId,
  };
  const next = [...getHistory(), stored];
  writeHistory(next);
  // Practice rows: mirror to the server if signed in. Best-effort, no await.
  if (isPracticeMode(mode)) {
    void syncPracticeRun(stored);
  }
  return stored;
}

const BACKFILL_FLAG_PREFIX = "zetamax:practice-synced-";

/**
 * Replace the on-disk history with the given rows. Used by the backfill
 * pass when it stamps fresh UUIDs onto legacy practice rows that lacked
 * runIds.
 */
function replaceHistory(rows: StoredRun[]): void {
  writeHistory(rows);
}

/**
 * One-shot per-device, per-user backfill. The first time a signed-in user
 * loads /me on this device:
 *   1. Walk local history; stamp a UUID onto any practice row missing runId.
 *   2. Persist the updated rows back to localStorage so future syncs are
 *      idempotent.
 *   3. Batch-push every practice row to /api/practice/sync.
 *   4. Flip the per-user flag (`zetamax:practice-synced-{userId}`) so this
 *      doesn't run again on this device.
 *
 * Safe to call any time — anonymous users short-circuit, and the flag
 * makes it a no-op after the first successful run.
 */
export async function ensurePracticeBackfilled(): Promise<{
  rows: StoredRun[];
  changed: boolean;
}> {
  const rowsBefore = getHistory();
  if (typeof window === "undefined") {
    return { rows: rowsBefore, changed: false };
  }
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { rows: rowsBefore, changed: false };

    const flagKey = BACKFILL_FLAG_PREFIX + user.id;
    if (window.localStorage.getItem(flagKey) === "1") {
      return { rows: rowsBefore, changed: false };
    }

    // Stamp UUIDs onto legacy practice rows that don't have one yet.
    let changed = false;
    const updated = rowsBefore.map((row) => {
      if (isPracticeMode(row.mode) && !row.runId) {
        changed = true;
        return { ...row, runId: makeUuid() };
      }
      return row;
    });
    if (changed) replaceHistory(updated);

    await syncPracticeBatch(updated.filter((r) => isPracticeMode(r.mode)));

    window.localStorage.setItem(flagKey, "1");
    return { rows: updated, changed };
  } catch {
    return { rows: rowsBefore, changed: false };
  }
}

/** Wipe stored history (all schema versions). */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY_V3);
    window.localStorage.removeItem(STORAGE_KEY_V2);
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

// `emptyTagStats` re-exported for any future caller that needs it without
// importing from drill/.
export { emptyTagStats };
