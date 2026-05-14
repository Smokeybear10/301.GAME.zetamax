"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RoundResult } from "@/lib/drill";
import { getStats, type LocalStats } from "@/lib/use-local-history";
import { TodaysFocus } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";

type Props = {
  result: RoundResult;
  onPlayAgain: () => void;
};

export function PostRoundSummary({ result, onPlayAgain }: Props) {
  const [stats, setStats] = useState<LocalStats>({
    todayBest: 0,
    lifetimeBest: 0,
    totalRuns: 0,
  });

  useEffect(() => {
    setStats(getStats());
  }, []);

  // Enter or Space to drill again.
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

  const isTodayBest = result.score > 0 && result.score >= stats.todayBest;
  const isLifetimeBest = result.score > 0 && result.score >= stats.lifetimeBest;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6 z-10 antialiased">
      {/* Title-card label */}
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-12 zp-fade zp-fade-1">
        Round complete
      </p>

      {/* The big number — the cinematic moment */}
      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(140px,28vw,400px)] mb-12 zp-fade zp-fade-2">
        {result.score}
      </div>

      {/* Meta lines */}
      <p className="font-light text-base md:text-lg tracking-[-0.005em] mb-2 zp-fade zp-fade-3">
        {isTodayBest ? (
          <>
            <span className="text-white">A new personal best{stats.todayBest > 0 && stats.todayBest !== result.score ? `, up from ${stats.todayBest}` : " for today"}.</span>
          </>
        ) : (
          <span className="text-white">
            {result.score} correct of {result.problemsAttempted}.
          </span>
        )}
      </p>
      <p className="font-mono text-[13px] tracking-[0.04em] text-white/42 zp-fade zp-fade-3">
        {result.problemsAttempted > 0 ? (
          <>
            {Math.round(result.accuracy * 100)}% accuracy &nbsp;·&nbsp; {Math.round(result.meanLatencyMs)}ms mean latency
          </>
        ) : (
          <>round abandoned</>
        )}
      </p>

      {/* Stats row */}
      <div className="flex gap-12 md:gap-16 pt-14 zp-fade zp-fade-4">
        <Stat label="today" value={`${stats.todayBest}`} highlight={isTodayBest} />
        <div className="w-px bg-white/10 self-stretch" aria-hidden="true" />
        <Stat label="lifetime" value={`${stats.lifetimeBest}`} highlight={isLifetimeBest} />
        <div className="w-px bg-white/10 self-stretch" aria-hidden="true" />
        <Stat label="runs" value={`${stats.totalRuns}`} />
      </div>

      <div className="pt-14">
        <TodaysFocus />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-16 zp-fade zp-fade-5">
        <ZpButton variant="primary" onClick={onPlayAgain}>
          Drill again
        </ZpButton>
        <ZpButton asChild variant="secondary">
          <Link href="/">Menu</Link>
        </ZpButton>
      </div>

      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-8 zp-fade zp-fade-5">
        or press Enter
      </p>

      <Link
        href="/competitive"
        className="absolute bottom-6 font-mono text-[10px] tracking-[0.18em] text-white/30 hover:text-white/65 uppercase transition-colors whitespace-nowrap zp-fade zp-fade-5"
      >
        track against friends →
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] tracking-[0.32em] text-white/42 uppercase mb-2">
        {label}
      </div>
      <div
        className={`font-mono font-light text-2xl tabular-nums tracking-[-0.01em] ${
          highlight ? "text-white" : "text-white/65"
        }`}
      >
        {value}
        {highlight && <span aria-label="new high"> ↑</span>}
      </div>
    </div>
  );
}
