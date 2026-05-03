"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RoundResult } from "@/lib/drill";
import { finishRun, type FinishRunResponse } from "@/lib/runs-api";
import { LeaderboardPanel } from "./leaderboard-panel";

type Submission =
  | { phase: "submitting" }
  | { phase: "abandoned" }
  | { phase: "ok"; response: FinishRunResponse }
  | { phase: "error"; code: string };

type Props = {
  runId: string;
  result: RoundResult;
  startedAtMs: number;
  onPlayAgain: () => void;
};

export function RankedPostRound({
  runId,
  result,
  startedAtMs,
  onPlayAgain,
}: Props) {
  const [sub, setSub] = useState<Submission>({ phase: "submitting" });

  useEffect(() => {
    if (result.problemsAttempted === 0) {
      setSub({ phase: "abandoned" });
      return;
    }
    let cancelled = false;
    finishRun({
      run_id: runId,
      events: result.events,
      started_at_client: new Date(startedAtMs).toISOString(),
      completed_at_client: new Date().toISOString(),
    })
      .then((response) => {
        if (cancelled) return;
        setSub({ phase: "ok", response });
      })
      .catch((e) => {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : "unknown";
        setSub({ phase: "error", code });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, result, startedAtMs]);

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

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-start sm:justify-center px-6 py-12 sm:py-16 z-10 antialiased overflow-y-auto">
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-10 zp-fade zp-fade-1">
        Round complete
      </p>

      {sub.phase === "submitting" && (
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 zp-fade zp-fade-2">
          syncing…
        </p>
      )}

      {sub.phase === "abandoned" && (
        <AbandonedPanel onPlayAgain={onPlayAgain} />
      )}

      {sub.phase === "error" && (
        <ErrorPanel code={sub.code} onPlayAgain={onPlayAgain} />
      )}

      {sub.phase === "ok" && (
        <SuccessPanel
          response={sub.response}
          result={result}
          onPlayAgain={onPlayAgain}
        />
      )}
    </div>
  );
}

function AbandonedPanel({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <div className="text-center max-w-md">
      <p className="font-light text-2xl mb-8 zp-fade zp-fade-2">
        No problems attempted.
      </p>
      <Buttons onPlayAgain={onPlayAgain} />
    </div>
  );
}

function ErrorPanel({
  code,
  onPlayAgain,
}: {
  code: string;
  onPlayAgain: () => void;
}) {
  let copy: string;
  switch (code) {
    case "rejected_wallclock":
      copy = "The round didn't pass the timing check. Try again.";
      break;
    case "rejected_latency":
    case "rejected_streak":
    case "rejected_score_mismatch":
      copy = "Run rejected by validation.";
      break;
    case "unauthorized":
      copy = "Your session expired. Sign in again.";
      break;
    case "network_failure":
      copy = "Couldn't reach the server. Try again.";
      break;
    default:
      copy = `Submission failed (${code}).`;
  }
  return (
    <div className="text-center max-w-md">
      <p className="font-light text-2xl mb-3 zp-fade zp-fade-2">
        Run not saved.
      </p>
      <p className="text-white/65 mb-8 zp-fade zp-fade-3">{copy}</p>
      <Buttons onPlayAgain={onPlayAgain} />
    </div>
  );
}

function SuccessPanel({
  response,
  result,
  onPlayAgain,
}: {
  response: FinishRunResponse;
  result: RoundResult;
  onPlayAgain: () => void;
}) {
  const validated = response.validation_status === "ok";
  return (
    <>
      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(120px,22vw,320px)] mb-8 zp-fade zp-fade-2">
        {response.score}
      </div>
      <p className="font-mono text-[12px] tabular-nums text-white/65 mb-1 zp-fade zp-fade-3">
        {validated ? "Saved." : `Status: ${response.validation_status}`}
        {response.cached ? " (already saved)" : ""}
      </p>
      <p className="font-mono text-[11px] text-white/42 mb-10 zp-fade zp-fade-3">
        {Math.round(result.accuracy * 100)}% accuracy ·{" "}
        {Math.round(result.meanLatencyMs)}ms mean
      </p>

      <div className="w-full max-w-md mb-10 zp-fade zp-fade-4">
        <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3 text-center">
          Best · last 30 days
        </p>
        <LeaderboardPanel />
      </div>

      <Buttons onPlayAgain={onPlayAgain} />
    </>
  );
}

function Buttons({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <>
      <div className="flex gap-3 zp-fade zp-fade-5">
        <button
          type="button"
          onClick={onPlayAgain}
          className="px-7 py-3 bg-white text-black font-medium text-sm hover:bg-transparent hover:text-white border border-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Drill again
        </button>
        <Link
          href="/competitive"
          className="px-7 py-3 border border-white/10 text-white/65 hover:text-white hover:border-white text-sm transition-colors flex items-center"
        >
          Modes
        </Link>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-6 zp-fade zp-fade-5">
        or press Enter
      </p>
    </>
  );
}
