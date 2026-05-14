"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory } from "@/lib/use-local-history";
import {
  FOCUS_PARAMS,
  findFocusTag,
  summarizeTags,
  type FocusResult,
} from "@/lib/practice-stats";
import { labelFor } from "@/app/me/todays-focus";

type State =
  | { kind: "loading" }
  | { kind: "focus"; focus: FocusResult }
  | { kind: "locked"; have: number; need: number }
  | { kind: "even"; total: number };

export function Focus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const rows = getHistory();
    const focus = findFocusTag(rows);
    if (focus) {
      setState({ kind: "focus", focus });
      return;
    }
    const totals = summarizeTags(rows);
    const have = Object.values(totals).reduce((s, t) => s + t.n, 0);
    if (have < FOCUS_PARAMS.MIN_TOTAL_N) {
      setState({ kind: "locked", have, need: FOCUS_PARAMS.MIN_TOTAL_N });
    } else {
      setState({ kind: "even", total: have });
    }
  }, []);

  return (
    <div className="bg-[#111] border border-white/[0.12] p-5 sm:p-[22px] grid grid-cols-[1fr_auto] gap-5 items-end">
      <div>
        <div className="flex justify-between items-baseline text-[10px] tracking-[0.24em] uppercase text-white/55 mb-1.5 font-mono">
          <span>
            <span className="text-white">today&apos;s focus</span>
          </span>
          <span>{statusChip(state)}</span>
        </div>
        {renderBody(state)}
      </div>
      {renderCta(state)}
    </div>
  );
}

function statusChip(state: State): string {
  if (state.kind === "loading") return "loading…";
  if (state.kind === "focus") {
    const pct = Math.round(state.focus.weakness_prob * 100);
    return `${pct}% conf · ${state.focus.n} attempts`;
  }
  if (state.kind === "locked") return `${state.have}/${state.need} problems`;
  return "no weak tag — keep drilling";
}

function renderBody(state: State) {
  if (state.kind === "loading") {
    return (
      <p className="font-mono text-[11px] text-white/42 mt-2">loading…</p>
    );
  }

  if (state.kind === "focus") {
    const { focus } = state;
    const ratio = Math.exp(focus.log_mean - focus.user_log_mean);
    return (
      <>
        <div className="font-sans font-extralight text-[clamp(28px,3.4vw,40px)] tracking-[-0.025em] leading-[1.05] text-white mt-1 mb-2">
          {labelFor(focus.tag)}
        </div>
        <p className="font-sans text-white/75 text-[12.5px] leading-[1.65] max-w-[58ch]">
          you&apos;re <span className="text-white">{ratio.toFixed(1)}× slower</span>{" "}
          on this pattern than your own baseline. {focus.n} attempts over the
          last 30 rounds. one drill targets this. no dashboards of deficits.
        </p>
      </>
    );
  }

  if (state.kind === "locked") {
    return (
      <>
        <div className="font-sans font-extralight text-[clamp(24px,2.6vw,30px)] tracking-[-0.022em] leading-[1.1] text-white/55 mt-1 mb-2">
          data insufficient
        </div>
        <p className="font-sans text-white/75 text-[12.5px] leading-[1.65] max-w-[58ch]">
          drill <span className="text-white">{state.need - state.have} more problems</span>{" "}
          and the diagnostic will surface the one mental-math pattern most
          worth working on next.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="font-sans font-extralight text-[clamp(24px,2.6vw,30px)] tracking-[-0.022em] leading-[1.1] text-white/55 mt-1 mb-2">
        nothing to drill
      </div>
      <p className="font-sans text-white/75 text-[12.5px] leading-[1.65] max-w-[58ch]">
        no statistically weak pattern across your last {state.total} attempts.
        keep the streak going.
      </p>
    </>
  );
}

function renderCta(state: State) {
  if (state.kind === "focus") {
    return (
      <Link
        href="/practice/learn"
        className="self-end bg-white text-black text-[11px] tracking-[0.24em] uppercase px-[18px] py-3 whitespace-nowrap hover:bg-white/85 transition-colors font-mono"
      >
        Drill this →
      </Link>
    );
  }
  if (state.kind === "locked") {
    return (
      <Link
        href="/practice/classic"
        className="self-end border border-white/[0.12] hover:border-white/[0.28] text-white text-[11px] tracking-[0.24em] uppercase px-[18px] py-3 whitespace-nowrap transition-colors font-mono"
      >
        Drill →
      </Link>
    );
  }
  return null;
}
