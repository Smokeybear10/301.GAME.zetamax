"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type FirmSim, type Problem, type RoundResult } from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { saveRun } from "@/lib/use-local-history";
import { KEYBIND_DEFAULTS } from "@/lib/drill";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { AnimatedProblem } from "@/app/_components/animated-problem";
import {
  feedbackTick,
  feedbackSkip,
  feedbackCorrect,
  feedbackWrong,
} from "@/lib/feedback/play-feedback";
import { SimResults } from "./sim-results";

const DIGIT_KEYS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

const OP_WORD: Record<Problem["op"], string> = {
  add: "plus",
  sub: "minus",
  mul: "times",
  div: "divided by",
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SimScreen({ sim }: { sim: FirmSim }) {
  const [drillKey, setDrillKey] = useState(0);
  const [nonce, setNonce] = useState("seed");
  const savedRef = useRef(false);
  const typedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fresh =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNonce(fresh);
  }, []);

  const seed = `sim-${sim.id}-${nonce}-${drillKey}`;
  const { state, drill } = useDrill(
    seed,
    sim.durationMs,
    sim.generator,
    KEYBIND_DEFAULTS,
    {
      negativeMarking: sim.negativeMarking,
      maxAttempts: sim.maxAttempts ?? undefined,
    },
  );

  // Imperative typed-answer render (bypasses React).
  useEffect(() => {
    if (typedRef.current) typedRef.current.textContent = state.typedAnswer;
  });

  // Route a key through the engine + fire feedback imperatively (no renders on
  // the keystroke path — see classic-screen for the rationale).
  const handleKeyRef = useRef<(key: string) => void>(() => {});
  handleKeyRef.current = (key: string) => {
    if (DIGIT_KEYS.has(key)) feedbackTick();
    const before = drill.getState();
    drill.handleKeystroke(key);
    const after = drill.getState();
    if (after.score > before.score) {
      feedbackCorrect(typedRef.current);
    } else if (after.currentProblemIndex > before.currentProblemIndex) {
      if (key === KEYBIND_DEFAULTS.skip) feedbackSkip();
      else feedbackWrong(typedRef.current);
    }
  };

  useEffect(() => {
    const { submit, skip, delete: del } = KEYBIND_DEFAULTS;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const recognized =
        DIGIT_KEYS.has(e.key) || e.key === submit || e.key === skip || e.key === del;
      const idle = state.status === "idle";
      if (!recognized && !idle) return;
      if (e.key.length === 1 || recognized) e.preventDefault();
      drill.start();
      if (recognized) handleKeyRef.current(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drill, state.status]);

  // Persist when the round ends — saved as a "classic" local row (a real
  // arithmetic run), so it still feeds the heatmap and lifetime totals.
  useEffect(() => {
    if (state.status !== "ended" || savedRef.current) return;
    savedRef.current = true;
    const result: RoundResult = drill.end();
    if (result.problemsAttempted > 0) {
      saveRun("classic", seed, sim.generator, result, sim.durationMs);
    }
  }, [state.status, drill, seed, sim.generator, sim.durationMs]);

  const attempted = state.events.length;

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      {/* Top strip — score · attempts/cap · timer */}
      <header className="flex justify-between items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <AnimatedScore
          value={state.score}
          className={state.status === "running" ? "text-white" : "text-white/42"}
        />
        <span className="text-[11px] tracking-[0.18em] uppercase text-white/42">
          {sim.maxAttempts ? `${attempted} / ${sim.maxAttempts}` : sim.firm}
          {sim.negativeMarking && (
            <span className="ml-3 text-white/30">−1 wrong</span>
          )}
        </span>
        <span className={state.status === "running" ? "text-white" : "text-white/42"}>
          {formatTime(state.msRemaining)}
        </span>
      </header>

      {/* Center stage */}
      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {state.status === "idle" && (
          <>
            <p className="font-mono text-[11px] tracking-[0.32em] text-white/65 uppercase">
              {sim.name}
            </p>
            <p className="font-mono text-[11px] tracking-[0.18em] text-white/42 uppercase">
              {sim.format}
            </p>
            <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase mt-4">
              press any key to begin
            </p>
          </>
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

      <ZpButton asChild variant="floating">
        <Link href="/arcade" aria-label="Back to arcade" title="Arcade">
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">arcade</span>
        </Link>
      </ZpButton>

      {state.status === "ended" && (
        <SimResults
          sim={sim}
          result={drill.end()}
          onPlayAgain={() => {
            savedRef.current = false;
            setDrillKey((k) => k + 1);
          }}
        />
      )}
    </main>
  );
}
