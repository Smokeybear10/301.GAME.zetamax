"use client";

import type { Op } from "@/lib/drill";
import type { OpSummary } from "@/lib/practice-stats";

const OP_LABEL: Record<Op, string> = {
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
};

const OPS: readonly Op[] = ["add", "sub", "mul", "div"] as const;

type Props = {
  summary: Record<Op, OpSummary>;
};

function fmtLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function OpBars({ summary }: Props) {
  const totalAttempts = OPS.reduce((s, op) => s + summary[op].n, 0);
  if (totalAttempts === 0) {
    return (
      <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        No per-op data yet — drill a round to populate this.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {OPS.map((op) => {
        const s = summary[op];
        const pct = Math.round(s.accuracy * 100);
        const lat = fmtLatency(s.meanLatencyMs);
        const empty = s.n === 0;
        return (
          <div
            key={op}
            className={`grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 sm:gap-4 ${
              empty ? "opacity-40" : ""
            }`}
          >
            <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/65 truncate">
              {OP_LABEL[op]}
            </div>
            <div className="relative h-2 bg-white/[0.06] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-white/85 motion-safe:transition-[width] motion-safe:duration-700"
                style={{ width: empty ? "0%" : `${s.accuracy * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="font-mono text-[11px] tabular-nums text-right text-white/65 whitespace-nowrap">
              <span className="text-white">{empty ? "—" : `${pct}%`}</span>
              <span className="mx-2 text-white/20">·</span>
              <span>{lat}</span>
              <span className="mx-2 text-white/20">·</span>
              <span className="text-white/42">n={s.n}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
