"use client";

import { useEffect, useState } from "react";
import { getHistory } from "@/lib/use-local-history";
import {
  MUL_FACT_MAX,
  MUL_FACT_MIN,
  mulFactKey,
  summarizeMulFacts,
  type FactSummary,
} from "@/lib/practice-stats";

type Cell = { a: number; b: number; n: number; accuracy: number };

function intensity(c: Cell): -1 | 0 | 1 | 2 | 3 | 4 | 5 {
  if (c.n === 0) return -1;
  const acc = c.accuracy;
  if (acc < 0.4) return 0;
  if (acc < 0.55) return 1;
  if (acc < 0.7) return 2;
  if (acc < 0.85) return 3;
  if (acc < 0.95) return 4;
  return 5;
}

function tone(n: number): string {
  if (n === -1)
    return "bg-transparent border border-dashed border-white/10";
  if (n === 0) return "bg-white/[0.04]";
  if (n === 1) return "bg-white/[0.08]";
  if (n === 2) return "bg-white/[0.16]";
  if (n === 3) return "bg-white/[0.32]";
  if (n === 4) return "bg-white/[0.55]";
  return "bg-white";
}

export function Heatmap() {
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [cells, setCells] = useState<Cell[]>([]);
  const [overallAccuracy, setOverallAccuracy] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);

  useEffect(() => {
    const rows = getHistory();
    const facts = summarizeMulFacts(rows);
    const factMap = new Map<string, FactSummary>();
    let attempts = 0;
    let correct = 0;
    for (const f of facts) {
      factMap.set(mulFactKey(f.a, f.b), f);
      attempts += f.n;
      correct += f.correct;
    }
    const grid: Cell[] = [];
    for (let a = MUL_FACT_MIN; a <= MUL_FACT_MAX; a++) {
      for (let b = MUL_FACT_MIN; b <= MUL_FACT_MAX; b++) {
        const f = factMap.get(mulFactKey(a, b));
        grid.push({
          a,
          b,
          n: f?.n ?? 0,
          accuracy: f?.accuracy ?? 0,
        });
      }
    }
    setCells(grid);
    setTotalAttempts(attempts);
    setOverallAccuracy(attempts > 0 ? correct / attempts : 0);
    setPhase("ready");
  }, []);

  return (
    <div className="bg-[#111] border border-white/[0.12] p-[18px]">
      <div className="flex justify-between items-baseline text-[10px] tracking-[0.24em] uppercase text-white/55 mb-3 pb-2 border-b border-white/[0.08] font-mono">
        <span>
          <span className="text-white">×-table · accuracy</span>
        </span>
        <span>
          {phase === "ready" && totalAttempts > 0
            ? `${Math.round(overallAccuracy * 100)}%`
            : "—"}
        </span>
      </div>

      {phase === "ready" && totalAttempts === 0 ? (
        <div className="py-2">
          <p className="font-mono text-[11px] text-white/42 mb-3">
            data insufficient · no multiplication problems drilled yet
          </p>
          <Grid empty />
        </div>
      ) : (
        <Grid cells={cells} />
      )}

      <div className="flex items-center gap-2.5 text-[10px] tracking-[0.18em] uppercase text-white/42 mt-3 font-mono">
        <span>cold</span>
        <span className="flex gap-0.5">
          <span className="w-3 h-3 bg-white/[0.04]" />
          <span className="w-3 h-3 bg-white/[0.16]" />
          <span className="w-3 h-3 bg-white/[0.32]" />
          <span className="w-3 h-3 bg-white/[0.55]" />
          <span className="w-3 h-3 bg-white" />
        </span>
        <span>hot</span>
        <span className="ml-auto text-white">12 × 12 facts</span>
      </div>
    </div>
  );
}

function Grid({ cells, empty }: { cells?: Cell[]; empty?: boolean }) {
  if (empty) {
    return (
      <div className="grid grid-cols-12 gap-[2px] mt-1 opacity-60">
        {Array.from({ length: 144 }).map((_, i) => (
          <span key={i} className="aspect-square block bg-transparent border border-dashed border-white/10" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-12 gap-[2px] mt-1">
      {(cells ?? []).map((c, i) => (
        <span
          key={i}
          className={"aspect-square block " + tone(intensity(c))}
          title={`${c.a} × ${c.b} · n=${c.n} · acc=${Math.round(c.accuracy * 100)}%`}
        />
      ))}
    </div>
  );
}
