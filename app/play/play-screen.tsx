"use client";

import { useEffect, useRef, useState } from "react";
import type { Problem } from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { PostRoundSummary } from "./post-round-summary";

const RECOGNIZED_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "Backspace", "Enter", "Tab",
]);

const OP_SYMBOL: Record<Problem["op"], string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayScreen() {
  // Counter-based seed: increments on every "Drill again". v0 placeholder;
  // production will fetch seed + run_id from POST /api/runs/start.
  const [drillId, setDrillId] = useState(0);
  const seed = `dev-${drillId}`;
  const { state, drill } = useDrill(seed);
  const typedRef = useRef<HTMLSpanElement>(null);

  // Imperative DOM update for the typed answer. Bypasses React's reconciler
  // so keystroke-to-render stays under 16ms even with hundreds of keystrokes.
  // Runs after every render — setting textContent on a span is microseconds.
  useEffect(() => {
    if (typedRef.current) {
      typedRef.current.textContent = state.typedAnswer;
    }
  });

  // Global keydown listener. Captures keys regardless of focus so the user
  // never has to think about clicking the input first.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!RECOGNIZED_KEYS.has(e.key)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      // Idempotent: start() no-ops if not idle; handleKeystroke no-ops if not running.
      drill.start();
      drill.handleKeystroke(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drill]);

  return (
    <main className="fixed inset-0 bg-zinc-950 text-zinc-50 flex flex-col select-none">
      {/* Top strip */}
      <header className="flex justify-between items-center p-6 font-mono text-sm tabular-nums text-zinc-500">
        <span>score {state.score}</span>
        <span>{formatTime(state.msRemaining)}</span>
      </header>

      {/* Center */}
      <section className="flex-1 flex flex-col items-center justify-center gap-10 px-4">
        {state.status === "idle" && (
          <p className="font-mono text-sm text-zinc-500 tracking-wide">
            press any digit to start
          </p>
        )}

        {state.status === "running" && state.currentProblem && (
          <>
            <div className="font-mono text-6xl md:text-8xl tabular-nums whitespace-nowrap">
              {state.currentProblem.a}
              <span className="mx-4 text-zinc-500">
                {OP_SYMBOL[state.currentProblem.op]}
              </span>
              {state.currentProblem.b}
            </div>
            <div className="font-mono text-6xl md:text-8xl tabular-nums flex items-center min-h-[1.1em]">
              <span ref={typedRef} aria-live="polite" />
              <span className="ml-1 text-emerald-400 animate-pulse">│</span>
            </div>
          </>
        )}
      </section>

      {/* Bottom hint strip */}
      {state.status === "running" && (
        <footer className="text-center p-6 text-xs text-zinc-600 tracking-wide">
          tab to skip · enter to submit · backspace to delete
        </footer>
      )}

      {state.status === "ended" && (
        <PostRoundSummary
          result={drill.end()}
          onPlayAgain={() => setDrillId((id) => id + 1)}
        />
      )}
    </main>
  );
}
