"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZETAMAC_DEFAULTS, currentStreak, type Problem, type RoundResult } from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { useStreakBroadcast } from "@/lib/use-streak-broadcast";
import { saveRun } from "@/lib/use-local-history";
import { MobileKeypad } from "@/app/practice/classic/mobile-keypad";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { AnimatedProblem } from "@/app/_components/animated-problem";

export type Opponent = {
  runId: string;
  seed: string;
  durationMs: number;
  score: number;
  displayName: string;
  /** submittedAt (ms since their round start) for each correct answer. */
  correctTimings: number[];
};

const DIGIT_KEYS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

const OP_WORD: Record<Problem["op"], string> = {
  add: "plus",
  sub: "minus",
  mul: "times",
  div: "divided by",
};

const KEYBINDS = { submit: "Enter", skip: "Tab", delete: "Backspace" } as const;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RaceScreen({ opponent }: { opponent: Opponent | null }) {
  if (!opponent) return <MissingScreen />;
  return <RaceActive opponent={opponent} />;
}

function RaceActive({ opponent }: { opponent: Opponent }) {
  const [attempt, setAttempt] = useState(0);
  const [ghostScore, setGhostScore] = useState(0);
  const [ended, setEnded] = useState<RoundResult | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const savedRef = useRef(false);
  const typedRef = useRef<HTMLSpanElement>(null);

  const seed = `race-${opponent.runId}-${attempt}`;
  const { state, drill } = useDrill(
    seed,
    opponent.durationMs,
    ZETAMAC_DEFAULTS,
    KEYBINDS,
  );
  const streak = currentStreak(state.events, state.durationMs - state.msRemaining);
  useStreakBroadcast(streak, state.score, state.status === "running");

  // Imperative typed-answer update (matches ranked-screen pattern).
  useEffect(() => {
    if (typedRef.current) typedRef.current.textContent = state.typedAnswer;
  });

  // Mark drill start wall-clock when it transitions to running.
  useEffect(() => {
    if (state.status === "running" && startedAtRef.current === null) {
      startedAtRef.current = performance.now();
    }
    if (state.status === "idle") {
      startedAtRef.current = null;
      setGhostScore(0);
    }
  }, [state.status]);

  // Ghost ticker — schedules a setState for each opponent correct answer
  // at its original ms offset. rAF would also work but timeouts are cheaper.
  useEffect(() => {
    if (state.status !== "running" || startedAtRef.current === null) return;
    const start = startedAtRef.current;
    const timers: number[] = [];
    for (let i = 0; i < opponent.correctTimings.length; i++) {
      const at = opponent.correctTimings[i];
      const due = start + at - performance.now();
      if (due <= 0) continue;
      const id = window.setTimeout(() => {
        setGhostScore(i + 1);
      }, due);
      timers.push(id);
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [state.status, opponent.correctTimings]);

  // Capture round end → write history + show post-round.
  useEffect(() => {
    if (state.status !== "ended" || savedRef.current) return;
    savedRef.current = true;
    const result = drill.end();
    if (result.problemsAttempted > 0) {
      try {
        saveRun("classic", seed, ZETAMAC_DEFAULTS, result, opponent.durationMs);
      } catch {
        // best-effort
      }
    }
    setEnded(result);
  }, [state.status, drill, seed, opponent.durationMs]);

  // Global keydown — any key starts the drill from idle; recognized keys feed input.
  useEffect(() => {
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
  }, [drill, state.status]);

  const onRaceAgain = useCallback(() => {
    savedRef.current = false;
    setEnded(null);
    setGhostScore(0);
    setAttempt((a) => a + 1);
  }, []);

  const youAhead = state.score > ghostScore;
  const tied = state.score === ghostScore;

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      <header className="grid grid-cols-3 items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <span
          className={`text-left inline-flex items-baseline gap-[0.5ch] ${state.status === "running" ? "text-white" : "text-white/42"}`}
        >
          <span className="text-[10px] tracking-[0.18em] uppercase text-white/42">you</span>
          <AnimatedScore value={state.score} />
        </span>
        <span className="text-center text-[10px] tracking-[0.32em] uppercase text-white/42">
          ghost race · {formatTime(state.msRemaining)}
        </span>
        <span
          className={`text-right inline-flex items-baseline gap-[0.5ch] justify-self-end ${state.status === "running" ? "text-white/85" : "text-white/42"}`}
        >
          <AnimatedScore value={ghostScore} />
          <span className="text-[10px] tracking-[0.18em] uppercase text-white/42">
            {opponent.displayName.toLowerCase()}
          </span>
        </span>
      </header>

      {state.status === "running" && (
        <p
          className={`text-center font-mono text-[10px] tracking-[0.32em] uppercase mt-2 transition-colors ${
            tied
              ? "text-white/42"
              : youAhead
                ? "text-white"
                : "text-white/55"
          }`}
        >
          {tied
            ? "tied"
            : youAhead
              ? `+${state.score - ghostScore} ahead`
              : `${ghostScore - state.score} behind`}
        </p>
      )}

      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {state.status === "idle" && !ended && (
          <div className="text-center">
            <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase mb-3">
              press any key to begin · racing {opponent.displayName}
            </p>
            <p className="font-mono text-[11px] text-white/30 tracking-[0.18em] uppercase">
              same problems · same {formatTime(opponent.durationMs)} · they scored {opponent.score}
            </p>
          </div>
        )}

        {state.status === "running" && state.currentProblem && (
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
          drill.start();
          drill.handleKeystroke(key);
        }}
      />

      {state.status !== "running" && !ended && (
        <ZpButton asChild variant="floating">
          <Link href={`/r/${opponent.runId}`} aria-label="Back to their run" title="Their run">
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">back</span>
          </Link>
        </ZpButton>
      )}

      {ended && (
        <PostRace
          you={ended.score}
          them={opponent.score}
          opponentName={opponent.displayName}
          onRaceAgain={onRaceAgain}
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

function PostRace({
  you,
  them,
  opponentName,
  onRaceAgain,
}: {
  you: number;
  them: number;
  opponentName: string;
  onRaceAgain: () => void;
}) {
  const margin = you - them;
  const verdict = margin > 0 ? "You won" : margin < 0 ? "They won" : "Tied";
  const tone = margin > 0 ? "text-white" : margin < 0 ? "text-white/65" : "text-white/42";

  // Auto-restart on Enter / Space (matches other post-round screens).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRaceAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onRaceAgain]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6 py-12 z-10 antialiased">
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-6 zp-fade zp-fade-1">
        Race complete
      </p>
      <p className={`font-light text-3xl mb-2 zp-fade zp-fade-2 ${tone}`}>{verdict}</p>
      <div className="font-mono text-[clamp(48px,8vw,96px)] tabular-nums tracking-[-0.04em] leading-none my-6 zp-fade zp-fade-2">
        <span className={tone}>{you}</span>
        <span className="text-white/30 mx-3">–</span>
        <span className="text-white/55">{them}</span>
      </div>
      <p className="font-mono text-[12px] text-white/55 mb-10 zp-fade zp-fade-3">
        {margin === 0
          ? `Dead heat with ${opponentName}`
          : margin > 0
            ? `Beat ${opponentName} by ${margin}`
            : `${opponentName} beat you by ${-margin}`}
      </p>
      <div className="flex gap-3 zp-fade zp-fade-4">
        <ZpButton variant="primary" onClick={onRaceAgain}>
          Race again
        </ZpButton>
        <ZpButton asChild variant="secondary">
          <Link href="/">Home</Link>
        </ZpButton>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-6 zp-fade zp-fade-5">
        or press Enter
      </p>
    </div>
  );
}

function MissingScreen() {
  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6 antialiased">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        Run unavailable
      </p>
      <p className="text-white/65 mb-8 leading-relaxed text-center max-w-md">
        This run can&apos;t be raced. Only validated ranked rounds work as ghosts.
      </p>
      <ZpButton asChild variant="chip">
        <Link href="/">back to home</Link>
      </ZpButton>
    </main>
  );
}
