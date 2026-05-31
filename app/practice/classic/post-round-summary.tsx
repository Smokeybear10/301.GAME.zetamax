"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RoundResult } from "@/lib/drill";
import { getStats, getHistory, type LocalStats } from "@/lib/use-local-history";
import { lastNScores } from "@/lib/practice-stats";
import { TodaysFocus } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { ScoreSparkline } from "@/app/me/score-sparkline";

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
  const [recent, setRecent] = useState<ReturnType<typeof lastNScores>>([]);
  // The score starts at 0 and flips to the real value once mounted, so
  // AnimatedScore's CSS transition runs the odometer 0 → final. (Mounting
  // it at the final value would render statically.)
  const [shownScore, setShownScore] = useState(0);

  useEffect(() => {
    setStats(getStats());
    setRecent(lastNScores(getHistory(), 30, "all"));
    // Kick the count-up on the next frame so the 0 → value transition fires.
    const id = requestAnimationFrame(() => setShownScore(result.score));
    return () => cancelAnimationFrame(id);
  }, [result.score]);

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

  // "Beat your previous best?" is judged against the pre-run snapshot.
  const isTodayBest = result.score > 0 && result.score >= stats.todayBest;
  const isLifetimeBest = result.score > 0 && result.score >= stats.lifetimeBest;

  // getStats() reads in this component's mount effect, which React fires
  // before the parent's persist effect (classic-screen.tsx) — so `stats`
  // reflects history *before* this run. Fold the just-finished run in so the
  // counters match the headline instead of lagging a round. Abandoned rounds
  // (problemsAttempted === 0) aren't persisted, so they don't move counters.
  const saved = result.problemsAttempted > 0;
  const todayBest = saved ? Math.max(stats.todayBest, result.score) : stats.todayBest;
  const lifetimeBest = saved ? Math.max(stats.lifetimeBest, result.score) : stats.lifetimeBest;
  const totalRuns = saved ? stats.totalRuns + 1 : stats.totalRuns;

  // Relative context: compare this run to the average of prior runs. `recent`
  // is the pre-run snapshot (this run isn't persisted yet), so it's a clean
  // baseline. Only meaningful once a couple of rounds exist.
  const priorAvg =
    recent.length > 0
      ? Math.round(recent.reduce((s, p) => s + p.score, 0) / recent.length)
      : 0;
  const delta = result.score - priorAvg;
  const contextLine =
    !saved
      ? null
      : recent.length < 1
        ? "your first logged round"
        : isLifetimeBest && recent.length >= 2
          ? "best yet"
          : delta >= 0
            ? `${delta} above your average`
            : `${Math.abs(delta)} below your average`;
  const showSparkline = saved && recent.length >= 2;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6 z-10 antialiased overflow-y-auto py-12">
      {/* Title-card label */}
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-12 zp-fade zp-fade-1">
        Round complete
      </p>

      {/* The big number — the cinematic moment. Counts up 0 → score. */}
      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(140px,28vw,400px)] zp-fade zp-fade-2">
        <AnimatedScore value={shownScore} slots={String(result.score).length} />
      </div>
      {(isTodayBest || isLifetimeBest) && (
        <div
          className="h-px bg-white/50 w-28 mb-12 motion-safe:origin-center motion-safe:animate-[zp-pb-rule_500ms_ease-out_650ms_both]"
          aria-hidden="true"
        />
      )}
      {!(isTodayBest || isLifetimeBest) && <div className="mb-12" />}

      {/* Meta lines */}
      <p className="font-light text-base md:text-lg tracking-[-0.005em] mb-2 zp-fade zp-fade-3">
        {isTodayBest ? (
          <span className="text-white">
            A new personal best
            {stats.todayBest > 0 && stats.todayBest !== result.score
              ? `, up from ${stats.todayBest}`
              : " for today"}
            .
          </span>
        ) : (
          <span className="text-white">
            {result.score} correct of {result.problemsAttempted}.
          </span>
        )}
      </p>
      <p className="font-mono text-[13px] tracking-[0.04em] text-white/42 zp-fade zp-fade-3">
        {result.problemsAttempted > 0 ? (
          <>
            {Math.round(result.accuracy * 100)}% accuracy &nbsp;·&nbsp;{" "}
            {Math.round(result.meanLatencyMs)}ms mean latency
          </>
        ) : (
          <>round abandoned</>
        )}
      </p>
      {contextLine && (
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/35 mt-3 zp-fade zp-fade-3">
          {contextLine}
        </p>
      )}

      {showSparkline && (
        <div className="w-full max-w-md mt-8 zp-fade zp-fade-4">
          <ScoreSparkline points={recent} />
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-12 md:gap-16 pt-14 zp-fade zp-fade-4">
        <Stat label="today" value={`${todayBest}`} highlight={isTodayBest} />
        <div className="w-px bg-white/10 self-stretch" aria-hidden="true" />
        <Stat label="lifetime" value={`${lifetimeBest}`} highlight={isLifetimeBest} />
        <div className="w-px bg-white/10 self-stretch" aria-hidden="true" />
        <Stat label="runs" value={`${totalRuns}`} />
      </div>

      <div className="pt-14">
        <TodaysFocus />
      </div>

      {/* Earned conversion: a good round is the moment to offer ranking it.
          Practice rounds genuinely carry over to the account on first sign-in
          (ensurePracticeBackfilled), so the carry-over line is honest. */}
      {saved && result.score > 0 && (
        <Link
          href="/auth/login?next=%2Fcompetitive%2Franked"
          className="group mt-12 text-center zp-fade zp-fade-5"
        >
          <span className="font-mono text-[12px] tracking-[0.06em] text-white/70 group-hover:text-white transition-colors">
            Sign in to rank this against friends →
          </span>
          <span className="block font-mono text-[10.5px] tracking-[0.04em] text-white/35 mt-1.5">
            your {totalRuns} {totalRuns === 1 ? "round" : "rounds"} carry over
          </span>
        </Link>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-10 zp-fade zp-fade-5">
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

      <style jsx>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes zp-pb-rule {
            from {
              transform: scaleX(0);
              opacity: 0;
            }
            to {
              transform: scaleX(1);
              opacity: 1;
            }
          }
        }
      `}</style>
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
