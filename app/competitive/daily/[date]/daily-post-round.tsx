"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DAILY_TARGET_COUNT, ZETAMAC_DEFAULTS, type RoundResult } from "@/lib/drill";
import { finishRun, type FinishRunResponse } from "@/lib/runs-api";
import { saveRun } from "@/lib/use-local-history";
import { TodaysFocus } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";
import { ShareButton } from "@/app/_components/share-button";
import { DailyLeaderboardPanel } from "../daily-leaderboard-panel";

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Elapsed time from event log: time of the last event's submittedAt (round-
 * relative ms). For a completed daily, that's when the 50th correct answer
 * committed. Empty events → 0.
 */
function elapsedFromEvents(result: RoundResult): number {
  if (result.events.length === 0) return 0;
  return result.events[result.events.length - 1].submittedAt;
}

type Submission =
  | { phase: "submitting" }
  | { phase: "abandoned" }
  | { phase: "ok"; response: FinishRunResponse }
  | { phase: "error"; code: string };

type Props = {
  date: string;
  runId: string;
  seed: string;
  durationMs: number;
  result: RoundResult;
  startedAtMs: number;
};

export function DailyPostRound({
  date,
  runId,
  seed,
  durationMs,
  result,
  startedAtMs,
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
        if (response.validation_status === "ok" && !response.cached) {
          try {
            saveRun("daily", seed, ZETAMAC_DEFAULTS, result, durationMs, {
              runId,
            });
          } catch {
            // best-effort
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

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-start sm:justify-center px-6 py-12 sm:py-16 z-10 antialiased overflow-y-auto">
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-10 zp-fade zp-fade-1">
        Daily · {date}
      </p>

      {sub.phase === "submitting" && (
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 zp-fade zp-fade-2">
          syncing…
        </p>
      )}

      {sub.phase === "abandoned" && <Abandoned />}

      {sub.phase === "error" && <ErrorPanel code={sub.code} />}

      {sub.phase === "ok" && (
        <SuccessPanel runId={runId} response={sub.response} result={result} />
      )}
    </div>
  );
}

function Abandoned() {
  return (
    <div className="text-center max-w-md">
      <p className="font-light text-2xl mb-3 zp-fade zp-fade-2">
        No problems attempted.
      </p>
      <p className="text-white/65 mb-8 zp-fade zp-fade-3">
        That counts as a forfeit — no retry today.
      </p>
      <BackLink />
    </div>
  );
}

function ErrorPanel({ code }: { code: string }) {
  let copy: string;
  switch (code) {
    case "rejected_wallclock":
      copy = "The round didn't pass timing checks. Counts as a forfeit.";
      break;
    case "rejected_incomplete":
      copy = `Couldn't finish all ${DAILY_TARGET_COUNT} in time. No retry today.`;
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
      <p className="font-light text-2xl mb-3 zp-fade zp-fade-2">Run not saved.</p>
      <p className="text-white/65 mb-8 zp-fade zp-fade-3">{copy}</p>
      <BackLink />
    </div>
  );
}

function SuccessPanel({
  runId,
  response,
  result,
}: {
  runId: string;
  response: FinishRunResponse;
  result: RoundResult;
}) {
  const validated = response.validation_status === "ok";
  const elapsedMs = elapsedFromEvents(result);
  return (
    <>
      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(120px,22vw,320px)] mb-8 tabular-nums zp-fade zp-fade-2">
        {formatTime(elapsedMs)}
      </div>
      <p className="font-mono text-[12px] tabular-nums text-white/65 mb-1 zp-fade zp-fade-3">
        {validated ? `${DAILY_TARGET_COUNT} of ${DAILY_TARGET_COUNT} done.` : `Status: ${response.validation_status}`}
        {response.cached ? " (already saved)" : ""}
      </p>
      <p className="font-mono text-[11px] text-white/42 mb-10 zp-fade zp-fade-3">
        {Math.round(result.meanLatencyMs)}ms per problem
      </p>

      <div className="w-full max-w-md mb-10 zp-fade zp-fade-4">
        <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3 text-center">
          Daily mean · last 30 days
        </p>
        <DailyLeaderboardPanel />
      </div>

      <TodaysFocus />

      <BackLink />

      <div className="mt-4 flex items-center gap-5 zp-fade zp-fade-5">
        <Link
          href={`/r/${runId}`}
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 hover:text-white/65 transition-colors"
        >
          replay this round →
        </Link>
        <ShareButton runId={runId} text={`I did today's Zetamax daily in ${formatTime(elapsedMs)}. Beat it.`} />
      </div>
    </>
  );
}

function BackLink() {
  return (
    <div className="flex gap-3 zp-fade zp-fade-5">
      <ZpButton asChild variant="primary">
        <Link href="/competitive/daily">Back to daily</Link>
      </ZpButton>
      <ZpButton asChild variant="secondary">
        <Link href="/">Home</Link>
      </ZpButton>
    </div>
  );
}
