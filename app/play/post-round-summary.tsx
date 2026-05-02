"use client";

import { useEffect } from "react";
import type { RoundResult } from "@/lib/drill";

type Props = {
  result: RoundResult;
  onPlayAgain: () => void;
};

export function PostRoundSummary({ result, onPlayAgain }: Props) {
  // Enter or Space to drill again — keep the keyboard-first feel into the post-round screen.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayAgain]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-10 px-4">
      <div className="bg-zinc-900 rounded-md p-10 w-full max-w-md text-center border border-zinc-800">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">
          Round complete
        </p>
        <p className="font-mono text-7xl tabular-nums mb-1">{result.score}</p>
        <p className="text-sm text-zinc-500 mb-8">
          correct of {result.problemsAttempted}
        </p>

        <div className="space-y-2 mb-10">
          <SummaryRow
            label="Accuracy"
            value={`${Math.round(result.accuracy * 100)}%`}
          />
          <SummaryRow
            label="Mean latency"
            value={`${Math.round(result.meanLatencyMs)}ms`}
          />
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full bg-emerald-400 text-black font-medium py-3 rounded-md hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Drill again
        </button>
        <p className="text-xs text-zinc-600 mt-3">or press Enter</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}
