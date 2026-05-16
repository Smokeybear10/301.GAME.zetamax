"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Problem, RoundResult } from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import { saveRun } from "@/lib/use-local-history";
import { usePracticeConfig } from "@/lib/use-practice-config";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { AnimatedProblem } from "@/app/_components/animated-problem";
import { MobileKeypad } from "./mobile-keypad";
import { PostRoundSummary } from "./post-round-summary";
import { SettingsModal } from "./settings-modal";

const DIGIT_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]);

// Spoken form for screen readers — paired with an aria-live region so the
// current problem is announced semantically ("47 plus 38") instead of as raw
// glyphs ("47 minus-sign 38" or worse, silence on the × character).
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

export function ClassicScreen() {
  const { config, setConfig } = usePracticeConfig();
  const [drillKey, setDrillKey] = useState(0);
  const [nonce, setNonce] = useState<string>("seed");
  const [showSettings, setShowSettings] = useState(false);

  // Per-page-load random nonce, generated in an effect so SSR and the first
  // client render see the same stable value ("seed") — no hydration mismatch.
  // After mount the nonce flips to a fresh random value, so reloads produce a
  // brand-new problem stream instead of replaying the previous session's.
  useEffect(() => {
    const fresh =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNonce(fresh);
  }, []);

  // drillKey advances on every "Drill again" so consecutive rounds within a
  // session also get different problem streams.
  const seed = `practice-${nonce}-${drillKey}`;
  const { state, drill } = useDrill(
    seed,
    config.durationMs,
    config.generator,
    config.keybinds,
  );
  const typedRef = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(false);

  // Imperative DOM update for the typed answer (bypasses React reconciliation).
  useEffect(() => {
    if (typedRef.current) {
      typedRef.current.textContent = state.typedAnswer;
    }
  });

  // Global keydown listener for the drill. Idle: any non-modifier key starts
  // the drill (matching the "press any key" copy); only recognized keys also
  // count as input. Running: only recognized keys are handled.
  useEffect(() => {
    if (showSettings) return;
    const { submit, skip, delete: del } = config.keybinds;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const recognized =
        DIGIT_KEYS.has(e.key) || e.key === submit || e.key === skip || e.key === del;
      const idle = state.status === "idle";
      if (!recognized && !idle) return;
      if (e.key.length === 1 || recognized) e.preventDefault();
      drill.start();
      if (recognized) drill.handleKeystroke(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drill, showSettings, state.status, config.keybinds]);

  // Persist run when round ends.
  useEffect(() => {
    if (state.status !== "ended" || savedRef.current) return;
    savedRef.current = true;
    const result: RoundResult = drill.end();
    if (result.problemsAttempted > 0) {
      saveRun("classic", seed, config.generator, result, config.durationMs);
    }
  }, [state.status, drill, seed, config.generator, config.durationMs]);

  const settingsAccessible = state.status !== "running";

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      {/* Top strip — score + timer, both faint when idle */}
      <header className="flex justify-between items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <AnimatedScore
          value={state.score}
          className={state.status === "running" ? "text-white" : "text-white/42"}
        />
        <span className={state.status === "running" ? "text-white" : "text-white/42"}>
          {formatTime(state.msRemaining)}
        </span>
      </header>

      {/* Center stage */}
      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {state.status === "idle" && (
          <p className="font-mono text-xs tracking-[0.32em] text-white/42 uppercase">
            press any key to begin
          </p>
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
            {/* Screen-reader-only announcement of the current problem. The
                visual block above is aria-hidden because raw glyphs (×, ÷, −)
                read poorly. This re-renders on every problem change and the
                aria-live region announces it. */}
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
        keybinds={config.keybinds}
        onKey={(key) => {
          drill.start();
          drill.handleKeystroke(key);
        }}
      />

      {/* Back link — up to the mode picker. Mirrors the settings chip on the
          opposite side. Hidden during a running drill so it can't distract or
          be mis-clicked. */}
      {settingsAccessible && (
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

      {/* Settings — labeled chip, only visible when not drilling. Top-right on
          mobile (where the keypad fills the bottom), bottom-right on desktop. */}
      {settingsAccessible && (
        <ZpButton
          variant="floating"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
          className="left-auto right-3 sm:left-auto sm:right-6"
        >
          <SettingsIcon />
          <span className="hidden sm:inline">settings</span>
        </ZpButton>
      )}

      {state.status === "ended" && (
        <PostRoundSummary
          result={drill.end()}
          onPlayAgain={() => {
            savedRef.current = false;
            setDrillKey((k) => k + 1);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          config={config}
          onSave={(next) => {
            setConfig(next);
            setShowSettings(false);
            savedRef.current = false;
            setDrillKey((k) => k + 1);
          }}
          onClose={() => setShowSettings(false)}
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

function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
