"use client";

import { useEffect, useMemo, useState } from "react";
import {
  findFocusTag,
  summarizeTags,
  type ModeFilter,
  type RunRow,
} from "@/lib/practice-stats";
import { labelFor } from "./todays-focus";

const FILTER_KEY = "zetamax:patterns-filter";

const FILTERS: ModeFilter[] = ["all", "classic", "ranked", "daily"];
const FILTER_LABEL: Record<ModeFilter, string> = {
  all: "All",
  classic: "Classic",
  ranked: "Ranked",
  daily: "Daily",
};

function isModeFilter(s: string): s is ModeFilter {
  return (FILTERS as string[]).includes(s);
}

function fmtLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Diagnostic table for the /me Stats tab. Mode filter chip persists in
 * localStorage. Featured "Today's focus" at the top mirrors what the
 * post-round card shows; full sortable list below for users who want to
 * see all their pattern stats.
 */
export function PatternsSection({ rows }: { rows: RunRow[] }) {
  const [filter, setFilter] = useState<ModeFilter>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(FILTER_KEY);
      if (stored && isModeFilter(stored)) setFilter(stored);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const pickFilter = (f: ModeFilter) => {
    setFilter(f);
    try {
      window.localStorage.setItem(FILTER_KEY, f);
    } catch {
      // ignore
    }
  };

  const focus = useMemo(() => findFocusTag(rows, filter), [rows, filter]);

  const sortedTags = useMemo(() => {
    const totals = summarizeTags(rows, filter);
    return Object.entries(totals)
      .filter(([, t]) => t.n > 0)
      .map(([tag, t]) => {
        const meanMs = Math.exp(t.sum_log_lat / t.n);
        const accuracy = t.correct / t.n;
        return { tag, n: t.n, meanMs, accuracy };
      })
      .sort((a, b) => b.meanMs - a.meanMs);
  }, [rows, filter]);

  if (!hydrated) {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        loading…
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 flex-wrap">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => pickFilter(f)}
              className={`px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase border transition-colors ${
                active
                  ? "border-white text-white"
                  : "border-white/10 text-white/42 hover:text-white hover:border-white/30"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          );
        })}
      </div>

      {focus && (
        <div className="border border-white/15 bg-white/[0.03] px-5 py-4 mb-6">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-2">
            Learn · {FILTER_LABEL[filter].toLowerCase()}
          </p>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="font-light text-lg tracking-[-0.01em] text-white">
              {labelFor(focus.tag)}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-white/65 whitespace-nowrap">
              {Math.exp(focus.log_mean - focus.user_log_mean).toFixed(1)}× usual ·
              n={focus.n}
            </span>
          </div>
        </div>
      )}

      {sortedTags.length === 0 ? (
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
          drill 30+ problems to unlock learn
        </p>
      ) : (
        <div className="border-t border-b border-white/10 divide-y divide-white/10">
          {sortedTags.map(({ tag, n, meanMs, accuracy }) => {
            const isFocus = focus?.tag === tag;
            return (
              <div
                key={tag}
                className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-3 sm:gap-5 px-3 py-3 ${
                  isFocus ? "bg-white/[0.04]" : ""
                }`}
              >
                <span
                  className={`font-light truncate ${isFocus ? "text-white" : "text-white/85"}`}
                  title={tag}
                >
                  {labelFor(tag)}
                </span>
                <span className="font-mono tabular-nums text-white/65 text-[11px] whitespace-nowrap">
                  {fmtLatency(meanMs)}
                </span>
                <span className="hidden sm:inline font-mono tabular-nums text-white/42 text-[11px] whitespace-nowrap">
                  {Math.round(accuracy * 100)}%
                </span>
                <span className="font-mono tabular-nums text-white/42 text-[11px]">
                  n={n}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
