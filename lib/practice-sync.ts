"use client";

import { createClient } from "@/lib/supabase/client";
import type { RunRow, SaveMode } from "@/lib/practice-stats";

const SYNC_URL = "/api/practice/sync";
const HISTORY_URL = "/api/practice/history";

export function isPracticeMode(mode: SaveMode | undefined): boolean {
  return (
    mode === "classic" ||
    mode === "quant" ||
    mode === "compound" ||
    mode === "learn"
  );
}

/**
 * Shape a local StoredRun into the wire-format the sync endpoint expects
 * (the only difference is `runId` → `id`). Kept in one place so server and
 * client stay aligned if the schema grows.
 */
function toApiRow(row: RunRow): Record<string, unknown> {
  return {
    id: row.runId,
    mode: row.mode,
    score: row.score,
    problemsAttempted: row.problemsAttempted,
    problemsCorrect: row.problemsCorrect,
    meanLatencyMs: row.meanLatencyMs,
    durationMs: row.durationMs,
    endedAt: row.endedAt,
    byOp: row.byOp,
    mulFacts: row.mulFacts,
    byTag: row.byTag,
    tagVersion: row.tagVersion,
  };
}

/**
 * Best-effort: if the user is signed in, post this row to /api/practice/sync.
 * Anonymous users and network failures fall through silently — the next
 * `flushPendingPracticeRuns()` call on /me load will catch any misses.
 */
export async function syncPracticeRun(row: RunRow): Promise<void> {
  if (!row.runId || !isPracticeMode(row.mode)) return;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [toApiRow(row)] }),
      keepalive: true,
    });
  } catch {
    // best-effort; missed rows are reconciled on next /me load
  }
}

/**
 * Batch-sync. Used by the first-sign-in backfill and by /me's reconcile
 * pass. Splits into chunks under the server's batch cap.
 */
export async function syncPracticeBatch(rows: RunRow[]): Promise<number> {
  const eligible = rows.filter((r) => r.runId && isPracticeMode(r.mode));
  if (eligible.length === 0) return 0;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const BATCH = 100;
  let total = 0;
  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH);
    try {
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: chunk.map(toApiRow) }),
      });
      if (res.ok) {
        const json = (await res.json()) as { inserted?: number };
        total += json.inserted ?? 0;
      }
    } catch {
      // continue with next chunk; misses are reconciled on next pass
    }
  }
  return total;
}

/**
 * Fetch the authed user's practice history from the server. Returns null
 * when signed out or on network error so callers can fall back to local.
 */
export async function fetchPracticeHistory(
  limit = 500,
): Promise<RunRow[] | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const res = await fetch(`${HISTORY_URL}?limit=${limit}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rows: RunRow[] };
    return json.rows ?? [];
  } catch {
    return null;
  }
}
