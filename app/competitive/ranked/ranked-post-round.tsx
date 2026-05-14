"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ZETAMAC_DEFAULTS, type RoundResult } from "@/lib/drill";
import { finishRun, type FinishRunResponse } from "@/lib/runs-api";
import { saveRun } from "@/lib/use-local-history";
import { TodaysFocus } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";
import { LeaderboardPanel } from "./leaderboard-panel";

type Submission =
  | { phase: "submitting" }
  | { phase: "abandoned" }
  | { phase: "ok"; response: FinishRunResponse }
  | { phase: "error"; code: string };

type Props = {
  runId: string;
  seed: string;
  durationMs: number;
  result: RoundResult;
  startedAtMs: number;
  onPlayAgain: () => void;
};

export function RankedPostRound({
  runId,
  seed,
  durationMs,
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
        // Mirror the round to localStorage so the cross-mode diagnostic on
        // /me can aggregate ranked rounds. Only on validated saves.
        if (response.validation_status === "ok" && !response.cached) {
          try {
            saveRun("ranked", seed, ZETAMAC_DEFAULTS, result, durationMs);
          } catch {
            // best-effort — local stats are nice-to-have, not load-bearing
          }
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : "unknown";
        setSub({ phase: "error", code });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, seed, durationMs, result, startedAtMs]);

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
          runId={runId}
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
  runId,
  response,
  result,
  onPlayAgain,
}: {
  runId: string;
  response: FinishRunResponse;
  result: RoundResult;
  onPlayAgain: () => void;
}) {
  const validated = response.validation_status === "ok";
  const elo = response.elo;
  return (
    <>
      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(120px,22vw,320px)] mb-8 zp-fade zp-fade-2">
        {response.score}
      </div>
      <p className="font-mono text-[12px] tabular-nums text-white/65 mb-1 zp-fade zp-fade-3">
        {validated ? "Saved." : `Status: ${response.validation_status}`}
        {response.cached ? " (already saved)" : ""}
      </p>
      <p className="font-mono text-[11px] text-white/42 mb-8 zp-fade zp-fade-3">
        {Math.round(result.accuracy * 100)}% accuracy ·{" "}
        {Math.round(result.meanLatencyMs)}ms mean
      </p>

      {elo && <EloDelta elo={elo} />}

      <div className="w-full max-w-md mb-10 zp-fade zp-fade-4">
        <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3 text-center">
          Rating · last 30 days
        </p>
        <LeaderboardPanel />
      </div>

      <TodaysFocus />

      <Buttons onPlayAgain={onPlayAgain} />

      <Link
        href={`/r/${runId}`}
        className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 hover:text-white/65 transition-colors zp-fade zp-fade-5"
      >
        replay this round →
      </Link>
    </>
  );
}

function EloDelta({ elo }: { elo: NonNullable<FinishRunResponse["elo"]> }) {
  const sign = elo.rating_delta > 0 ? "+" : elo.rating_delta < 0 ? "" : "±";
  const beforeRating = elo.new_rating - elo.rating_delta;
  const tone =
    elo.rating_delta > 0
      ? "text-white"
      : elo.rating_delta < 0
        ? "text-white/65"
        : "text-white/42";

  return (
    <div className="w-full max-w-md mb-10 zp-fade zp-fade-3">
      <div className="flex items-baseline justify-center gap-3 mb-3 flex-wrap">
        <span className={`font-mono tabular-nums text-2xl ${tone}`}>
          {sign}
          {Math.abs(elo.rating_delta)} ELO
        </span>
        <span className="font-mono text-[11px] tabular-nums text-white/42">
          {beforeRating} → {elo.new_rating}
        </span>
        {elo.is_provisional && (
          <span
            title="Provisional — first 30 rated rounds"
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42"
          >
            provisional
          </span>
        )}
      </div>

      <ul className="space-y-1 max-w-xs mx-auto">
        {elo.breakdown.map((b) => {
          const bSign = b.delta > 0 ? "+" : b.delta < 0 ? "" : "±";
          const bTone =
            b.delta > 0
              ? "text-white"
              : b.delta < 0
                ? "text-white/65"
                : "text-white/42";
          return (
            <li
              key={b.opp_id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 font-mono text-[11px]"
            >
              <span className="text-white/65 truncate">vs {b.opp_name}</span>
              <span className={`tabular-nums ${bTone} w-12 text-right`}>
                {bSign}
                {Math.abs(b.delta)}
              </span>
              <span className="tabular-nums text-white/42 w-20 text-right">
                {b.my_score}–{b.opp_score}
              </span>
            </li>
          );
        })}
        <BaselineRow
          baseline={elo.baseline_delta}
          expected={elo.expected_score}
        />
      </ul>
    </div>
  );
}

function BaselineRow({
  baseline,
  expected,
}: {
  baseline: number;
  expected: number;
}) {
  const sign = baseline > 0 ? "+" : baseline < 0 ? "" : "±";
  const tone =
    baseline > 0
      ? "text-white"
      : baseline < 0
        ? "text-white/65"
        : "text-white/42";
  return (
    <li
      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 font-mono text-[11px]"
      title="Baseline ELO swing — score vs. expected for your rating"
    >
      <span className="text-white/65 truncate">baseline</span>
      <span className={`tabular-nums ${tone} w-12 text-right`}>
        {sign}
        {Math.abs(baseline)}
      </span>
      <span className="tabular-nums text-white/42 w-20 text-right">
        vs {expected}
      </span>
    </li>
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
          <Link href="/competitive">Modes</Link>
        </ZpButton>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-6 zp-fade zp-fade-5">
        or press Enter
      </p>
    </>
  );
}
