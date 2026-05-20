"use client";

import { useMemo } from "react";
import {
  findFocusTag,
  summarizeTags,
  type ModeFilter,
  type RunRow,
} from "@/lib/practice-stats";
import { labelFor } from "./todays-focus";

function fmtLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Pattern diagnostic table. The mode filter is owned by the parent Stats
 * tab so every section reads the same lens — see stats-section.tsx for the
 * chip row and persistence.
 */
export function PatternsSection({
  rows,
  filter,
}: {
  rows: RunRow[];
  filter: ModeFilter;
}) {
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

  return (
    <div>
      {focus && (
        <div className="border border-white/15 bg-white/[0.03] px-5 py-4 mb-6">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-2">
            Focus
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
