"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  findFocusTag,
  FOCUS_PARAMS,
  summarizeTags,
  type FocusResult,
} from "@/lib/practice-stats";
import { ZpButton } from "@/components/ui/zp-button";
import { getHistory } from "@/lib/use-local-history";

const SKIP_KEY_PREFIX = "zetamax:focus-skip-";

/** YYYY-MM-DD in America/New_York — same boundary as everything else. */
function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function skipKeyForToday(): string {
  return SKIP_KEY_PREFIX + todayET();
}

const TAG_LABELS: Record<string, string> = {
  // Patterns
  double: "doubles",
  "near-square": "near-square multiplication",
  "by-9": "multiplication by 9",
  "by-11": "multiplication by 11",
  "complement-near": "near-round operands",
  "repeated-digit": "repeated-digit operands",
  "same-tens": "same-tens-digit operands",
  // Skill tags
  "add-easy": "single-digit addition",
  "add-no-carry": "no-carry addition",
  "add-carry-once": "single-carry addition",
  "add-carry-multi": "multi-carry addition",
  "sub-easy": "single-digit subtraction",
  "sub-no-borrow": "no-borrow subtraction",
  "sub-borrow-once": "single-borrow subtraction",
  "sub-borrow-multi": "multi-borrow subtraction",
  "mul-table": "multiplication tables",
  "mul-large": "large multiplication",
  "div-table": "division tables",
  "div-large": "large division",
};

function labelFor(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

type Phase = "loading" | "ready" | "skipped";
type State =
  | { kind: "focus"; focus: FocusResult }
  | { kind: "locked"; have: number; need: number }
  | { kind: "even" };

/**
 * "Learn" card — surfaces the one mental-math pattern most worth drilling.
 * Three rendered states:
 *   - focus   : found a statistically slow tag → show it
 *   - locked  : not enough tagged problems yet → show progress
 *   - even    : enough data, no weak tag → render nothing (no help needed)
 *
 * Skipped-for-today renders nothing regardless of state.
 */
export function TodaysFocus() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(skipKeyForToday()) === "1") {
        setPhase("skipped");
        return;
      }
    } catch {
      // private mode — fall through and try to read
    }
    const rows = getHistory();
    const focus = findFocusTag(rows);
    if (focus) {
      setState({ kind: "focus", focus });
    } else {
      const totals = summarizeTags(rows);
      const have = Object.values(totals).reduce((s, t) => s + t.n, 0);
      if (have < FOCUS_PARAMS.MIN_TOTAL_N) {
        setState({ kind: "locked", have, need: FOCUS_PARAMS.MIN_TOTAL_N });
      } else {
        setState({ kind: "even" });
      }
    }
    setPhase("ready");
  }, []);

  if (phase !== "ready" || !state) return null;
  if (state.kind === "even") return null;

  const handleSkip = () => {
    try {
      window.localStorage.setItem(skipKeyForToday(), "1");
    } catch {
      // ignore
    }
    setPhase("skipped");
  };

  if (state.kind === "locked") {
    return (
      <section
        className="w-full max-w-md mb-8 zp-fade zp-fade-3"
        aria-label="Learn — locked"
      >
        <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3 text-center">
          Learn
        </p>
        <div className="border border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <span className="font-light text-base tracking-[-0.01em] text-white/65">
              Locked
            </span>
            <span className="font-mono text-[11px] tabular-nums text-white/42 whitespace-nowrap">
              {state.have}/{state.need} problems
            </span>
          </div>
          <p className="text-white/42 text-sm leading-relaxed">
            Drill a few more rounds and we&apos;ll surface the one mental-math
            pattern most worth working on next.
          </p>
        </div>
      </section>
    );
  }

  const { focus } = state;
  const ratio = Math.exp(focus.log_mean - focus.user_log_mean);
  const ratioStr = ratio.toFixed(1);

  return (
    <section
      className="w-full max-w-md mb-8 zp-fade zp-fade-3"
      aria-label="Learn"
    >
      <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3 text-center">
        Learn
      </p>
      <div className="border border-white/10 bg-white/[0.02] px-5 py-4">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <span className="font-light text-base tracking-[-0.01em] text-white">
            {labelFor(focus.tag)}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-white/65 whitespace-nowrap">
            {ratioStr}× your usual · n={focus.n}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ZpButton asChild variant="chip" size="sm">
            <Link href="/practice/learn">drill this →</Link>
          </ZpButton>
          <button
            type="button"
            onClick={handleSkip}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 hover:text-white/65 transition-colors"
          >
            skip for today
          </button>
        </div>
      </div>
    </section>
  );
}

/** Exported for /me Patterns to reuse the same friendly labels. */
export { labelFor };
