"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZETAMAC_DEFAULTS, type Problem, type RoundResult } from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { startRun } from "@/lib/runs-api";
import { MobileKeypad } from "@/app/practice/classic/mobile-keypad";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { AnimatedProblem } from "@/app/_components/animated-problem";
import { RankedPostRound } from "./ranked-post-round";

const DIGIT_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]);

const OP_WORD: Record<Problem["op"], string> = {
  add: "plus",
  sub: "minus",
  mul: "times",
  div: "divided by",
};

// Ranked rounds run on a fixed config — Zetamac defaults, default keybinds.
// The server-issued seed determines the entire problem stream.
const KEYBINDS = { submit: "Enter", skip: "Tab", delete: "Backspace" } as const;

type StartState =
  | { phase: "loading" }
  | { phase: "ready"; runId: string; seed: string; durationMs: number }
  | { phase: "error"; code: string };

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RankedScreen() {
  const [attempt, setAttempt] = useState(0);
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

  // Fetch a server-issued seed on mount and on every "Drill again".
  useEffect(() => {
    let cancelled = false;
    setStart({ phase: "loading" });
    setSubmission(null);
    submittedRef.current = false;
    startedAtMsRef.current = null;
    startRun()
      .then(({ run_id, seed, duration_ms }) => {
        if (cancelled) return;
        setStart({
          phase: "ready",
          runId: run_id,
          seed,
          durationMs: duration_ms,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : "unknown";
        setStart({ phase: "error", code });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Stable placeholder while loading so useDrill can construct an idle drill.
  const seed = start.phase === "ready" ? start.seed : `ranked-loading-${attempt}`;
  const durationMs = start.phase === "ready" ? start.durationMs : 120_000;

  const { state, drill } = useDrill(seed, durationMs, ZETAMAC_DEFAULTS, KEYBINDS);

  // Imperative DOM update for the typed answer (bypasses React reconciliation).
  useEffect(() => {
    if (typedRef.current) {
      typedRef.current.textContent = state.typedAnswer;
    }
  });

  // Capture when the drill actually started (first keystroke).
  useEffect(() => {
    if (state.status === "running" && startedAtMsRef.current === null) {
      startedAtMsRef.current = Date.now();
    }
    if (state.status === "idle") {
      startedAtMsRef.current = null;
    }
  }, [state.status]);

  // Global keydown listener — only when the drill is ready to accept input.
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

  // Hand off to the post-round overlay when the drill ends.
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

  const onPlayAgain = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  const showMenuChip = state.status !== "running";

  return (
    <main
      className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased"
      style={{ viewTransitionName: "ranked-hero" } as React.CSSProperties}
    >
      {/* Top strip — score · "ranked" label · timer */}
      <header className="grid grid-cols-3 items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <AnimatedScore
          value={state.score}
          className={`${state.status === "running" ? "text-white" : "text-white/42"} justify-self-start`}
        />
        <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 text-center">
          ranked
        </span>
        <span
          className={`${state.status === "running" ? "text-white" : "text-white/42"} text-right`}
        >
          {formatTime(state.msRemaining)}
        </span>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {start.phase === "loading" && (
          <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase">
            starting ranked round…
          </p>
        )}

        {start.phase === "error" && <ErrorState code={start.code} />}

        {start.phase === "ready" && state.status === "idle" && (
          <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase">
            press any key to begin · ranked
          </p>
        )}

        {start.phase === "ready" &&
          state.status === "running" &&
          state.currentProblem && (
            <>
              <AnimatedProblem
                a={state.currentProblem.a}
                op={state.currentProblem.op}
                b={state.currentProblem.b}
                index={state.currentProblemIndex}
                className="text-[clamp(72px,15vw,200px)]"
              />
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
            href="/"
            aria-label="Back to home"
            title="Home"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">home</span>
          </Link>
        </ZpButton>
      )}

      {submission && (
        <RankedPostRound
          runId={submission.runId}
          seed={submission.seed}
          durationMs={submission.durationMs}
          result={submission.result}
          startedAtMs={submission.startedAtMs}
          onPlayAgain={onPlayAgain}
        />
      )}

      <style jsx>{`
        @keyframes zp-caret {
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </main>
  );
}

function ErrorState({ code }: { code: string }) {
  let copy: string;
  if (code === "unauthorized") {
    copy = "Sign in to play ranked rounds.";
  } else if (code === "could not start run") {
    copy = "The server couldn't start a round just now. Try again in a moment.";
  } else {
    copy = `Couldn't start the round (${code}).`;
  }
  return (
    <div className="text-center max-w-md">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        Round failed to start
      </p>
      <p className="text-white/75 mb-8 leading-relaxed">{copy}</p>
      <ZpButton asChild variant="chip">
        <Link href="/">back to home</Link>
      </ZpButton>
    </div>
  );
}
