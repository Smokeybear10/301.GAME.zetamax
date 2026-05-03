"use client";

import type { RoundResult } from "@/lib/drill";

/**
 * Practice-mode round history, stored in localStorage.
 *
 * v1: keyed by mode "practice" only. v2 will add per-mode keys (sprint,
 * survival) once those exist.
 *
 * Cap of 100 stored runs is plenty for the post-round summary (we only need
 * today's-best and lifetime-best); older runs are pruned silently. v2 can
 * raise the cap or move history to IndexedDB if we ever build a /me page.
 */

const STORAGE_KEY = "zetamax:practice-history";
const MAX_STORED = 100;

export type StoredRun = {
  score: number;
  problemsAttempted: number;
  accuracy: number;
  meanLatencyMs: number;
  endedAt: number; // unix ms
};

export type LocalStats = {
  todayBest: number;
  lifetimeBest: number;
  totalRuns: number;
};

function readHistory(): StoredRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
    // QuotaExceededError, private browsing mode, etc. — silent drop is fine
  }
}

export function saveRun(result: RoundResult): StoredRun {
  const stored: StoredRun = {
    score: result.score,
    problemsAttempted: result.problemsAttempted,
    accuracy: result.accuracy,
    meanLatencyMs: result.meanLatencyMs,
    endedAt: Date.now(),
  };
  writeHistory([...readHistory(), stored]);
  return stored;
}

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
  const history = readHistory();
  const todayBest = history
    .filter((r) => isToday(r.endedAt))
    .reduce((max, r) => Math.max(max, r.score), 0);
  const lifetimeBest = history.reduce((max, r) => Math.max(max, r.score), 0);
  return { todayBest, lifetimeBest, totalRuns: history.length };
}
