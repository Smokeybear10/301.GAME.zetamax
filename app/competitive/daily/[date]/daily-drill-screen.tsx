"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DAILY_DURATION_MS,
  DAILY_TARGET_COUNT,
  ZETAMAC_DEFAULTS,
  type Problem,
  type RoundResult,
} from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { startRun } from "@/lib/runs-api";
import { createClient } from "@/lib/supabase/client";
import { MobileKeypad } from "@/app/practice/classic/mobile-keypad";
import { ZpButton } from "@/components/ui/zp-button";
import { DailyPostRound } from "./daily-post-round";

const DIGIT_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]);

const OP_SYMBOL: Record<Problem["op"], string> = {
  add: "+", sub: "−", mul: "×", div: "÷",
};

const OP_WORD: Record<Problem["op"], string> = {
  add: "plus", sub: "minus", mul: "times", div: "divided by",
};

// Daily v2: skip is disabled engine-side. Tab keystrokes are silently swallowed.
const KEYBINDS = { submit: "Enter", skip: "Tab", delete: "Backspace" } as const;
const DRILL_OPTS = {
  terminationMode: "count",
  targetCount: DAILY_TARGET_COUNT,
  disableSkip: true,
} as const;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type StartState =
  | { phase: "loading" }
  | { phase: "ready"; runId: string; seed: string; durationMs: number }
  | { phase: "already_attempted"; status: string; durationMs: number | null }
  | { phase: "error"; code: string };

export function DailyDrillScreen({ date }: { date: string }) {
  const [start, setStart] = useState<StartState>({ phase: "loading" });
  const [submission, setSubmission] = useState<
    | {
        runId: string;
        seed: string;
        durationMs: number;
        result: RoundResult;
        startedAtMs: number;
      }
    | null
  >(null);

  const typedRef = useRef<HTMLSpanElement>(null);
  const submittedRef = useRef(false);
  const startedAtMsRef = useRef<number | null>(null);

  // Fetch a server-issued daily run on mount.
  useEffect(() => {
    let cancelled = false;
    setStart({ phase: "loading" });
    setSubmission(null);
    submittedRef.current = false;
    startedAtMsRef.current = null;
    (async () => {
      try {
        const { run_id, seed, duration_ms } = await startRun({
          mode: "daily",
          daily_date: date,
        });
        if (cancelled) return;
        setStart({
          phase: "ready",
          runId: run_id,
          seed,
          durationMs: duration_ms,
        });
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : "unknown";
        if (code === "already_attempted") {
          // Look up the existing row's state to render the correct empty
          // state. RLS allows the user to read their own runs.
          const supabase = createClient();
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (uid) {
            const { data } = await supabase
              .from("runs")
              .select("validation_status, duration_ms")
              .eq("user_id", uid)
              .eq("mode", "daily")
              .eq("daily_date", date)
              .maybeSingle();
            if (cancelled) return;
            setStart({
              phase: "already_attempted",
              status: (data?.validation_status as string) ?? "unknown",
              durationMs: data?.duration_ms ?? null,
            });
            return;
          }
        }
        setStart({ phase: "error", code });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const seed = start.phase === "ready" ? start.seed : `daily-loading-${date}`;
  const durationMs = start.phase === "ready" ? start.durationMs : DAILY_DURATION_MS;
  const { state, drill } = useDrill(
    seed,
    durationMs,
    ZETAMAC_DEFAULTS,
    KEYBINDS,
    DRILL_OPTS,
  );

  const elapsedMs = durationMs - state.msRemaining;

  // Imperative typed answer write
  useEffect(() => {
    if (typedRef.current) {
      typedRef.current.textContent = state.typedAnswer;
    }
  });

  // Track started_at locally for finish payload
  useEffect(() => {
    if (state.status === "running" && startedAtMsRef.current === null) {
      startedAtMsRef.current = Date.now();
    }
    if (state.status === "idle") {
      startedAtMsRef.current = null;
    }
  }, [state.status]);

  // Global keydown listener
  useEffect(() => {
    if (start.phase !== "ready") return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const recognized =
        DIGIT_KEYS.has(e.key) ||
        e.key === KEYBINDS.submit ||
        e.key === KEYBINDS.skip ||
        e.key === KEYBINDS.delete;
      const idle = state.status === "idle";
      if (!recognized && !idle) return;
      if (e.key.length === 1 || recognized) e.preventDefault();
      drill.start();
      if (recognized) drill.handleKeystroke(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drill, start.phase, state.status]);

  // Hand off to post-round when drill ends
  useEffect(() => {
    if (state.status !== "ended" || submittedRef.current) return;
    if (start.phase !== "ready") return;
    submittedRef.current = true;
    const result: RoundResult = drill.end();
    setSubmission({
      runId: start.runId,
      seed: start.seed,
      durationMs: start.durationMs,
      result,
      startedAtMs: startedAtMsRef.current ?? Date.now() - durationMs,
    });
  }, [state.status, drill, start, durationMs]);

  // Forfeit beacon on pagehide while running
  useEffect(() => {
    if (start.phase !== "ready") return;
    if (state.status !== "running") return;
    const runId = start.runId;
    const handler = () => {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(`/api/runs/forfeit/${runId}`);
      }
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [start, state.status]);

  const showMenuChip = state.status !== "running";

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      <header className="grid grid-cols-3 items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <span className={`${state.status === "running" ? "text-white" : "text-white/42"} text-left`}>
          {Math.min(state.score + 1, DAILY_TARGET_COUNT)} of {DAILY_TARGET_COUNT}
        </span>
        <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 text-center">
          daily · {dateLabel(date)}
        </span>
        <span className={`${state.status === "running" ? "text-white" : "text-white/42"} text-right`}>
          {formatTime(elapsedMs)}
        </span>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {start.phase === "loading" && (
          <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase">
            loading daily…
          </p>
        )}

        {start.phase === "error" && <ErrorState code={start.code} />}

        {start.phase === "already_attempted" && (
          <AlreadyAttemptedState
            status={start.status}
            durationMs={start.durationMs}
            date={date}
          />
        )}

        {start.phase === "ready" && state.status === "idle" && (
          <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase text-center max-w-sm">
            press any key to begin
            <br />
            <span className="text-white/30">reload mid-round = forfeit</span>
          </p>
        )}

        {start.phase === "ready" &&
          state.status === "running" &&
          state.currentProblem && (
            <>
              <div
                aria-hidden="true"
                className="font-extralight tracking-[-0.05em] leading-none text-[clamp(72px,15vw,200px)] whitespace-nowrap"
              >
                {state.currentProblem.a}
                <span className="text-white/42 font-extralight mx-[0.18em]">
                  {OP_SYMBOL[state.currentProblem.op]}
                </span>
                {state.currentProblem.b}
              </div>
              <div className="sr-only" aria-live="polite" role="status">
                {state.currentProblem.a} {OP_WORD[state.currentProblem.op]}{" "}
                {state.currentProblem.b}
              </div>
              <div className="font-black tracking-[-0.05em] leading-none text-[clamp(72px,15vw,200px)] flex items-center min-h-[1.05em]">
                <span ref={typedRef} aria-live="polite" />
                <span
                  aria-hidden="true"
                  className="inline-block ml-1 w-[0.06em] h-[0.85em] bg-white align-[-0.05em] motion-safe:animate-[zp-caret_1.4s_steps(2)_infinite]"
                />
              </div>
            </>
          )}
      </section>

      <MobileKeypad
        keybinds={KEYBINDS}
        onKey={(key) => {
          if (start.phase !== "ready") return;
          drill.start();
          drill.handleKeystroke(key);
        }}
      />

      {showMenuChip && (
        <ZpButton asChild variant="floating">
          <Link
            href="/competitive/daily"
            aria-label="Back to daily"
            title="Daily"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">daily</span>
          </Link>
        </ZpButton>
      )}

      {submission && (
        <DailyPostRound
          date={date}
          runId={submission.runId}
          seed={submission.seed}
          durationMs={submission.durationMs}
          result={submission.result}
          startedAtMs={submission.startedAtMs}
        />
      )}

      <style jsx>{`
        @keyframes zp-caret {
          50% { opacity: 0; }
        }
      `}</style>
    </main>
  );
}

function AlreadyAttemptedState({
  status,
  durationMs,
  date,
}: {
  status: string;
  durationMs: number | null;
  date: string;
}) {
  const isCompleted = status === "ok";
  const isForfeited = status === "forfeited" || status === "rejected_incomplete";
  const headline = isCompleted
    ? "Done for this day."
    : isForfeited
      ? "Forfeited."
      : "Already attempted.";
  const detail = isCompleted
    ? `You finished in ${durationMs !== null ? formatTime(durationMs) : "—"} on ${dateLabel(date)}.`
    : isForfeited
      ? "You started this day's puzzle and didn't finish in time. No retry."
      : `Existing status: ${status}. No retry.`;
  return (
    <div className="text-center max-w-md">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        Daily · {dateLabel(date)}
      </p>
      <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] mb-4">
        {headline}
      </h1>
      <p className="text-white/65 mb-8 leading-relaxed">{detail}</p>
      <ZpButton asChild variant="chip">
        <Link href="/competitive/daily">back to daily</Link>
      </ZpButton>
    </div>
  );
}

function ErrorState({ code }: { code: string }) {
  let copy: string;
  switch (code) {
    case "unauthorized":
      copy = "Sign in to play the Daily.";
      break;
    case "invalid daily_date":
      copy = "That day is out of range.";
      break;
    default:
      copy = `Couldn't start (${code}).`;
  }
  return (
    <div className="text-center max-w-md">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        Daily failed to start
      </p>
      <p className="text-white/75 mb-8 leading-relaxed">{copy}</p>
      <ZpButton asChild variant="chip">
        <Link href="/competitive/daily">back to daily</Link>
      </ZpButton>
    </div>
  );
}
