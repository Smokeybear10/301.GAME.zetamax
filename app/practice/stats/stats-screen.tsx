"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearHistory,
  getHistory,
  type StoredRun,
} from "@/lib/use-local-history";
import {
  lastNScores,
  lifetimeTotals,
  summarizeByOp,
  summarizeMulFacts,
} from "@/lib/practice-stats";
import { MulFactGrid } from "./mul-fact-grid";
import { OpBars } from "./op-bars";
import { ScoreSparkline } from "./score-sparkline";

const SPARKLINE_WINDOW = 30;

type Hydration = "loading" | "ready";

export function StatsScreen() {
  const [phase, setPhase] = useState<Hydration>("loading");
  const [rows, setRows] = useState<StoredRun[]>([]);

  // Defer localStorage reads to a useEffect so SSR and first-paint markup
  // match — same pattern as usePracticeConfig. Empty rows + "loading" phase
  // is what shows during hydration; the empty state proper kicks in only
  // after we've confirmed there really is nothing stored.
  useEffect(() => {
    setRows(getHistory());
    setPhase("ready");
  }, []);

  const aggregates = useMemo(() => {
    return {
      totals: lifetimeTotals(rows),
      byOp: summarizeByOp(rows),
      facts: summarizeMulFacts(rows),
      points: lastNScores(rows, SPARKLINE_WINDOW),
    };
  }, [rows]);

  const handleReset = useCallback(() => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      "Reset all practice stats? This deletes every stored round on this device. Cannot be undone.",
    );
    if (!ok) return;
    clearHistory();
    setRows([]);
  }, []);

  const handleExport = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const json = JSON.stringify(rows, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zetamax-practice-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort. Browsers without Blob support skip the export.
    }
  }, [rows]);

  const isEmpty = phase === "ready" && rows.length === 0;

  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-16">
        <header className="flex items-center justify-between mb-10 sm:mb-14">
          <div>
            <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-2">
              Stats · practice
            </p>
            <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.03em] leading-none">
              Your runs
            </h1>
          </div>
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
          >
            ← menu
          </Link>
        </header>

        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="space-y-12 sm:space-y-16">
            <Section label="Lifetime">
              <LifetimeStrip totals={aggregates.totals} />
            </Section>

            <Section label="Score">
              <ScoreSparkline points={aggregates.points} />
            </Section>

            <Section label="By operation">
              <OpBars summary={aggregates.byOp} />
            </Section>

            <Section label={`Multiplication facts · ${2}–${12}`}>
              <MulFactGrid facts={aggregates.facts} />
            </Section>

            <footer className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-8 border-t border-white/10">
              <button
                type="button"
                onClick={handleExport}
                className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/65 hover:text-white border border-white/10 hover:border-white/30 px-4 py-2 transition-colors"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 hover:text-white border border-white/10 hover:border-white/30 px-4 py-2 transition-colors"
              >
                Reset all stats
              </button>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 sm:ml-auto sm:self-center">
                stored locally · this device only
              </p>
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-4 sm:mb-5">
        {label}
      </h2>
      {children}
    </section>
  );
}

function LifetimeStrip({
  totals,
}: {
  totals: ReturnType<typeof lifetimeTotals>;
}) {
  const accuracy =
    totals.problemsAttempted > 0
      ? Math.round((totals.problemsCorrect / totals.problemsAttempted) * 100)
      : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
      <Stat label="runs" value={`${totals.runs}`} />
      <Stat
        label="problems"
        value={`${totals.problemsAttempted.toLocaleString()}`}
      />
      <Stat label="accuracy" value={`${accuracy}%`} />
      <Stat label="time" value={fmtDuration(totals.totalDurationMs)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-4 sm:p-5">
      <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-2">
        {label}
      </div>
      <div className="font-mono text-2xl sm:text-3xl tabular-nums tracking-[-0.01em] text-white">
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 sm:py-24">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-6">
        Nothing tracked yet
      </p>
      <h2 className="font-extralight text-3xl sm:text-4xl tracking-[-0.03em] leading-tight mb-8 max-w-md mx-auto">
        Drill a round to start building stats.
      </h2>
      <p className="text-white/65 max-w-md mx-auto leading-relaxed mb-10">
        Per-operation accuracy, latency trends, and a multiplication-fact
        heatmap — all computed locally from your rounds.
      </p>
      <Link
        href="/practice"
        className="inline-block px-7 py-3 bg-white text-black font-medium text-sm border border-white hover:bg-transparent hover:text-white transition-colors"
      >
        Start drilling
      </Link>
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
