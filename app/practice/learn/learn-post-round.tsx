"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { summarizeTags, type FocusResult } from "@/lib/practice-stats";
import { getHistory, type StoredRun } from "@/lib/use-local-history";
import { labelFor } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";

type Props = {
  savedRow: StoredRun;
  targets: FocusResult[];
  onPlayAgain: () => void;
};

type Comparison = {
  tag: string;
  thisRoundN: number;
  thisRoundMs: number | null;
  priorMs: number | null;
};

function fmtLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function LearnPostRound({ savedRow, targets, onPlayAgain }: Props) {
  // Read history fresh and exclude this round's row by endedAt timestamp.
  // Same-ms-collision is astronomically unlikely; saveRun stamps Date.now().
  const [priorRows, setPriorRows] = useState<StoredRun[]>([]);
  useEffect(() => {
    const rows = getHistory();
    setPriorRows(rows.filter((r) => r.endedAt !== savedRow.endedAt));
  }, [savedRow.endedAt]);

  const priorTotals = useMemo(
    () => summarizeTags(priorRows, "all"),
    [priorRows],
  );

  const comparisons = useMemo<Comparison[]>(() => {
    return targets.map((t) => {
      const here = savedRow.byTag[t.tag];
      const prior = priorTotals[t.tag];
      const thisRoundMs =
        here && here.n > 0 ? Math.exp(here.sum_log_lat / here.n) : null;
      const priorMs =
        prior && prior.n > 0 ? Math.exp(prior.sum_log_lat / prior.n) : null;
      return {
        tag: t.tag,
        thisRoundN: here?.n ?? 0,
        thisRoundMs,
        priorMs,
      };
    });
  }, [targets, priorTotals, savedRow.byTag]);

  // Enter / Space → drill again.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayAgain]);

  const score = savedRow.score;
  const attempts = savedRow.problemsAttempted;
  const accuracy = attempts > 0 ? savedRow.problemsCorrect / attempts : 0;
  const meanLatency = savedRow.meanLatencyMs;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-start sm:justify-center px-6 py-12 sm:py-16 z-10 antialiased overflow-y-auto">
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-10 zp-fade zp-fade-1">
        Learn · round complete
      </p>

      {attempts === 0 ? (
        <AbandonedPanel onPlayAgain={onPlayAgain} />
      ) : (
        <>
          <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(120px,22vw,320px)] mb-8 zp-fade zp-fade-2">
            {score}
          </div>
          <p className="font-mono text-[12px] tabular-nums text-white/65 mb-1 zp-fade zp-fade-3">
            {score} correct of {attempts}.
          </p>
          <p className="font-mono text-[11px] text-white/42 mb-10 zp-fade zp-fade-3">
            {Math.round(accuracy * 100)}% accuracy · {Math.round(meanLatency)}ms
            mean
          </p>

          {comparisons.length > 0 && (
            <div className="w-full max-w-md mb-10 zp-fade zp-fade-4">
              <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-4 text-center">
                Per-pattern progress
              </p>
              <div className="border-t border-b border-white/10 divide-y divide-white/10">
                {comparisons.map((c) => (
                  <ComparisonRow key={c.tag} comp={c} />
                ))}
              </div>
            </div>
          )}

          <Buttons onPlayAgain={onPlayAgain} />
        </>
      )}
    </div>
  );
}

function ComparisonRow({ comp }: { comp: Comparison }) {
  const { tag, thisRoundN, thisRoundMs, priorMs } = comp;
  const hasBoth = priorMs !== null && thisRoundMs !== null;
  const delta = hasBoth ? thisRoundMs - priorMs : null;
  // Faster = good = lower ms = negative delta. Honest framing only when the
  // change exceeds noise (10% of prior).
  const meaningfulDelta =
    hasBoth && delta !== null && Math.abs(delta) > priorMs! * 0.1;
  const tone =
    !meaningfulDelta || delta === null
      ? "text-white/42"
      : delta < 0
        ? "text-white"
        : "text-white/42";

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 sm:gap-5 px-3 py-3">
      <span
        className="font-light truncate text-white/85"
        title={tag}
      >
        {labelFor(tag)}
      </span>
      <span className="font-mono tabular-nums text-white/42 text-[11px] whitespace-nowrap">
        {fmtLatency(priorMs)}
      </span>
      <span className="font-mono text-white/30 text-[11px]">→</span>
      <span
        className={`font-mono tabular-nums text-[11px] whitespace-nowrap ${tone}`}
        title={`n=${thisRoundN} this round`}
      >
        {fmtLatency(thisRoundMs)}
      </span>
    </div>
  );
}

function AbandonedPanel({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <div className="text-center max-w-md">
      <p className="font-light text-2xl mb-3 zp-fade zp-fade-2">
        No problems attempted.
      </p>
      <p className="text-white/65 mb-8 zp-fade zp-fade-3">
        Drill the round through to see per-pattern progress.
      </p>
      <Buttons onPlayAgain={onPlayAgain} />
    </div>
  );
}

function Buttons({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <>
      <div className="flex gap-3 zp-fade zp-fade-5">
        <ZpButton variant="primary" onClick={onPlayAgain}>
          Drill again
        </ZpButton>
        <ZpButton asChild variant="secondary">
          <Link href="/">Home</Link>
        </ZpButton>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-6 zp-fade zp-fade-5">
        or press Enter
      </p>
    </>
  );
}
