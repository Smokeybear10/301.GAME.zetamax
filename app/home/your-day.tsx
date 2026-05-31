"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/app/_components/empty-state";
import { getHistory } from "@/lib/use-local-history";
import { lifetimeTotals, type RunRow } from "@/lib/practice-stats";

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function bestScoreBetween(rows: RunRow[], fromMs: number, toMs: number): number {
  let best = 0;
  for (const r of rows) {
    if (r.endedAt >= fromMs && r.endedAt < toMs && r.score > best) best = r.score;
  }
  return best;
}

type Phase = "loading" | "ready";

export function YourDay() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [today, setToday] = useState(0);
  const [yesterday, setYesterday] = useState(0);
  const [lifetime, setLifetime] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);

  useEffect(() => {
    const rows = getHistory();
    const now = Date.now();
    const startToday = startOfDay(new Date(now));
    const startYesterday = startToday - 24 * 60 * 60 * 1000;

    setToday(bestScoreBetween(rows, startToday, now + 1));
    setYesterday(bestScoreBetween(rows, startYesterday, startToday));
    setLifetime(rows.reduce((m, r) => Math.max(m, r.score), 0));

    const totals = lifetimeTotals(rows);
    setTotalRuns(totals.runs);
    setAccuracy(
      totals.problemsAttempted > 0
        ? totals.problemsCorrect / totals.problemsAttempted
        : 0,
    );
    setPhase("ready");
  }, []);

  if (phase === "loading") {
    return (
      <Wrapper>
        <Insufficient note="loading…" />
      </Wrapper>
    );
  }

  if (totalRuns === 0) {
    return (
      <Wrapper>
        <EmptyState
          label="day 1 of your prep"
          directive="play your first round and your stats fill in here."
          cta={{ label: "drill →", href: "/practice/classic" }}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="grid grid-cols-3 gap-3.5">
        <Kv k="today" v={today > 0 ? String(today) : "—"} delta={deltaCopy(today, yesterday)} up={today > yesterday && yesterday > 0} />
        <Kv k="lifetime" v={String(lifetime)} delta={`${totalRuns} rounds`} />
        <Kv
          k="accuracy"
          v={`${Math.round(accuracy * 100)}`}
          unit="%"
          delta="lifetime"
        />
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-white/[0.12] p-[18px]">
      <PanelHead label={<span className="text-white">your day</span>} alt="local · all modes" />
      {children}
    </div>
  );
}

function PanelHead({ label, alt }: { label: React.ReactNode; alt: string }) {
  return (
    <div className="flex justify-between items-baseline text-[10px] tracking-[0.24em] uppercase text-white/55 mb-3 pb-2 border-b border-white/[0.08] font-mono">
      <span>{label}</span>
      <span>{alt}</span>
    </div>
  );
}

function Kv({
  k,
  v,
  unit,
  delta,
  up,
}: {
  k: string;
  v: string;
  unit?: string;
  delta: string;
  up?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mb-1">{k}</div>
      <div className="font-mono text-[28px] tabular-nums text-white font-medium tracking-[-0.03em] leading-none">
        {v}
        {unit && <span className="text-[16px] text-white/42 ml-0.5">{unit}</span>}
      </div>
      <div className={"font-mono text-[11px] mt-1.5 " + (up ? "text-white" : "text-white/55")}>
        {delta}
      </div>
    </div>
  );
}

function Insufficient({ note }: { note: string }) {
  return (
    <p className="font-mono text-[11px] text-white/42 py-3">
      {note}
    </p>
  );
}

function deltaCopy(today: number, yesterday: number): string {
  if (today === 0 && yesterday === 0) return "no rounds";
  if (today === 0) return `y'day: ${yesterday}`;
  if (yesterday === 0) return "first day";
  const diff = today - yesterday;
  if (diff > 0) return `↑ ${diff} from y'day ${yesterday}`;
  if (diff < 0) return `↓ ${Math.abs(diff)} from y'day ${yesterday}`;
  return `= y'day ${yesterday}`;
}
