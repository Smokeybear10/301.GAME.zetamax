"use client";

/*
 * Learn mode — design decisions:
 *   1) Multi-tag rotation across the user's top-3 weakest tags. Each problem
 *      picks one tag uniformly; rejection-sampling keeps the stream targeted
 *      while preserving variety. ~25 reps per tag per 80-problem round, well
 *      above the diagnostic's per-tag floor.
 *   2) Cold-start: this screen renders a locked card with progress until the
 *      user has 30 tagged events. The menu tile stays linkable so the user
 *      always knows what's needed; we don't fall back to classic, which would
 *      blur the mental model of what Learn is.
 *   3) Targeting is encoded into GeneratorConfig.targeting so generateProblem
 *      stays pure — same (seedHash, index, config-with-targeting) → same
 *      problem. The rollup re-derives via the same path, so byTag attribution
 *      is correct without engine plumbing.
 *   4) Persistence: saveRun("learn", ...). Surfaces in /me alongside other
 *      modes; weak-pattern diagnostic aggregates these in too.
 *   5) In-round UX reuses the Classic drill exactly, plus a small monospaced
 *      indicator under the header listing the targeted tag labels.
 *   6) Post-round shows prior log-mean vs. this round's mean for each target.
 *      Exponentiated to ms; honest framing (only call it improvement when it
 *      actually improves).
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KEYBIND_DEFAULTS,
  ZETAMAC_DEFAULTS,
  type GeneratorConfig,
  type Problem,
  type RoundResult,
  type TagKey,
} from "@/lib/drill";
import { useDrill } from "@/lib/use-drill";
import {
  FOCUS_PARAMS,
  topNWeakTags,
  totalTaggedEvents,
  type FocusResult,
} from "@/lib/practice-stats";
import { getHistory, saveRun, type StoredRun } from "@/lib/use-local-history";
import { labelFor } from "@/app/me/todays-focus";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";
import { AnimatedProblem } from "@/app/_components/animated-problem";
import { MobileKeypad } from "../classic/mobile-keypad";
import { LearnPostRound } from "./learn-post-round";

const DURATION_MS = 120_000;
const TOP_N = 3;

const DIGIT_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]);

const OP_WORD: Record<Problem["op"], string> = {
  add: "plus",
  sub: "minus",
  mul: "times",
  div: "divided by",
};

type Phase =
  | { kind: "loading" }
  | { kind: "locked"; have: number; need: number }
  | { kind: "active"; targets: FocusResult[] };

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LearnScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [drillKey, setDrillKey] = useState(0);
  const [nonce, setNonce] = useState<string>("seed");
  const [savedRow, setSavedRow] = useState<StoredRun | null>(null);

  // Stable per-load nonce — same SSR + first client render to avoid hydration
  // mismatch, then flips to a fresh random on mount.
  useEffect(() => {
    const fresh =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNonce(fresh);
  }, []);

  // Recompute targets every time drillKey advances (after a round saves, the
  // targets may shift). Re-reads localStorage to pick up the just-saved row.
  useEffect(() => {
    const rows = getHistory();
    const have = totalTaggedEvents(rows);
    const need = FOCUS_PARAMS.MIN_TOTAL_N;
    if (have < need) {
      setPhase({ kind: "locked", have, need });
      return;
    }
    const targets = topNWeakTags(rows, TOP_N);
    if (targets.length === 0) {
      // Degenerate case — total ≥ 30 but no tag has any data (shouldn't happen
      // since `summarizeTags` would have reported something). Treat as locked.
      setPhase({ kind: "locked", have, need });
      return;
    }
    setPhase({ kind: "active", targets });
  }, [drillKey]);

  if (phase.kind === "loading") {
    return (
      <main className="fixed inset-0 bg-black text-white flex items-center justify-center">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
          loading…
        </p>
      </main>
    );
  }

  if (phase.kind === "locked") {
    return <LockedView have={phase.have} need={phase.need} />;
  }

  return (
    <ActiveView
      targets={phase.targets}
      seed={`learn-${nonce}-${drillKey}`}
      onSaved={(row) => setSavedRow(row)}
      savedRow={savedRow}
      onPlayAgain={() => {
        setSavedRow(null);
        setDrillKey((k) => k + 1);
      }}
    />
  );
}

function LockedView({ have, need }: { have: number; need: number }) {
  const pct = Math.min(100, Math.round((have / need) * 100));
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-16 antialiased">
      <ZpButton asChild variant="chip" className="absolute top-6 left-6">
        <Link href="/" aria-label="Back to home">← home</Link>
      </ZpButton>

      <div className="text-center mb-8">
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
          Learn
        </p>
        <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-tight max-w-md mx-auto">
          Drill a few rounds first.
        </h1>
        <p className="text-white/65 mt-4 max-w-md mx-auto leading-relaxed">
          Learn picks the patterns you struggle on most, then drills them. It
          needs <span className="text-white">{need} tagged problems</span> to
          read your profile.
        </p>
      </div>

      <div className="w-full max-w-md mb-10">
        <div className="flex justify-between items-baseline mb-2">
          <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42">
            progress
          </span>
          <span className="font-mono text-sm tabular-nums text-white">
            {have}/{need}
          </span>
        </div>
        <div className="h-1 bg-white/10 overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <ZpButton asChild variant="primary">
          <Link href="/practice/classic">Drill Classic</Link>
        </ZpButton>
        <ZpButton asChild variant="secondary">
          <Link href="/">Home</Link>
        </ZpButton>
      </div>
    </main>
  );
}

type ActiveProps = {
  targets: FocusResult[];
  seed: string;
  savedRow: StoredRun | null;
  onSaved: (row: StoredRun) => void;
  onPlayAgain: () => void;
};

function ActiveView({
  targets,
  seed,
  savedRow,
  onSaved,
  onPlayAgain,
}: ActiveProps) {
  const generatorConfig = useMemo<GeneratorConfig>(() => {
    const ops = ZETAMAC_DEFAULTS.ops;
    return {
      ops,
      targeting: { tags: targets.map((t) => t.tag as TagKey) },
    };
  }, [targets]);

  const { state, drill } = useDrill(
    seed,
    DURATION_MS,
    generatorConfig,
    KEYBIND_DEFAULTS,
  );

  const typedRef = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(false);

  // Reset save guard whenever the seed changes (= new round).
  useEffect(() => {
    savedRef.current = false;
  }, [seed]);

  useEffect(() => {
    if (typedRef.current) {
      typedRef.current.textContent = state.typedAnswer;
    }
  });

  // Global keyboard handling. Same shape as Classic.
  useEffect(() => {
    const { submit, skip, delete: del } = KEYBIND_DEFAULTS;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const recognized =
        DIGIT_KEYS.has(e.key) ||
        e.key === submit ||
        e.key === skip ||
        e.key === del;
      const idle = state.status === "idle";
      if (!recognized && !idle) return;
      if (e.key.length === 1 || recognized) e.preventDefault();
      drill.start();
      if (recognized) drill.handleKeystroke(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drill, state.status]);

  // Persist the round — only when ended, only once per round.
  useEffect(() => {
    if (state.status !== "ended" || savedRef.current) return;
    savedRef.current = true;
    const result: RoundResult = drill.end();
    if (result.problemsAttempted > 0) {
      const row = saveRun("learn", seed, generatorConfig, result, DURATION_MS);
      onSaved(row);
    } else {
      // Abandoned. Still flip to ended so the post-round can render the
      // empty-state. Synthesize an empty row.
      onSaved({
        v: 3,
        mode: "learn",
        score: 0,
        problemsAttempted: 0,
        problemsCorrect: 0,
        meanLatencyMs: 0,
        durationMs: DURATION_MS,
        endedAt: Date.now(),
        byOp: {
          add: { n: 0, correct: 0, sumLatencyMs: 0 },
          sub: { n: 0, correct: 0, sumLatencyMs: 0 },
          mul: { n: 0, correct: 0, sumLatencyMs: 0 },
          div: { n: 0, correct: 0, sumLatencyMs: 0 },
        },
        mulFacts: {},
        byTag: {},
        tagVersion: 0,
      });
    }
  }, [state.status, drill, seed, generatorConfig, onSaved]);

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      <header className="flex justify-between items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <AnimatedScore
          value={state.score}
          className={
            state.status === "running" ? "text-white" : "text-white/42"
          }
        />
        <span
          className={
            state.status === "running" ? "text-white" : "text-white/42"
          }
        >
          {formatTime(state.msRemaining)}
        </span>
      </header>

      <p className="text-center font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mt-3 px-4 truncate">
        Learn · {targets.map((t) => labelFor(t.tag)).join(" · ")}
      </p>

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
        keybinds={KEYBIND_DEFAULTS}
        onKey={(key) => {
          drill.start();
          drill.handleKeystroke(key);
        }}
      />

      {state.status !== "running" && (
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

      {state.status === "ended" && savedRow && (
        <LearnPostRound
          savedRow={savedRow}
          targets={targets}
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
