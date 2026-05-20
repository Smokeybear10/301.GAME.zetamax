"use client";

import Link from "next/link";
import type { RunRow, SaveMode } from "@/lib/practice-stats";

type Props = {
  runs: RunRow[];
};

const MODE_LABEL: Record<SaveMode, string> = {
  classic: "classic",
  quant: "quant",
  compound: "compound",
  learn: "learn",
  ranked: "ranked",
  daily: "daily",
};

export function RecentRuns({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        no rounds in this view
      </p>
    );
  }

  return (
    <div className="border-t border-b border-white/10 divide-y divide-white/10">
      <Header />
      {runs.map((run) => (
        <Row key={`${run.endedAt}-${run.runId ?? "local"}`} run={run} />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 sm:gap-5 px-3 py-2 font-mono text-[9px] tracking-[0.32em] uppercase text-white/42">
      <span>when</span>
      <span className="text-right">mode</span>
      <span className="text-right tabular-nums">score</span>
      <span className="hidden sm:inline text-right tabular-nums">acc</span>
      <span className="hidden sm:inline text-right tabular-nums">mean</span>
    </div>
  );
}

function Row({ run }: { run: RunRow }) {
  const accuracy =
    run.problemsAttempted > 0
      ? Math.round((run.problemsCorrect / run.problemsAttempted) * 100)
      : 0;
  const mode = run.mode ?? "classic";
  const modeLabel = MODE_LABEL[mode] ?? mode;
  const clickable =
    !!run.runId && (mode === "ranked" || mode === "daily");

  const cells = (
    <>
      <span className="font-light text-white/85 truncate">
        {formatRelative(run.endedAt)}
      </span>
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/65 whitespace-nowrap text-right">
        {modeLabel}
      </span>
      <span className="font-mono tabular-nums text-white text-[13px] text-right whitespace-nowrap">
        {run.score}
      </span>
      <span className="hidden sm:inline font-mono tabular-nums text-white/65 text-[11px] text-right whitespace-nowrap">
        {accuracy}%
      </span>
      <span className="hidden sm:inline font-mono tabular-nums text-white/42 text-[11px] text-right whitespace-nowrap">
        {formatLatency(run.meanLatencyMs)}
      </span>
    </>
  );

  const className =
    "grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 sm:gap-5 px-3 py-3";

  if (clickable && run.runId) {
    return (
      <Link
        href={`/r/${run.runId}`}
        className={`${className} hover:bg-white/[0.04] transition-colors`}
      >
        {cells}
      </Link>
    );
  }

  return <div className={className}>{cells}</div>;
}

function formatRelative(endedAt: number): string {
  const diffMs = Date.now() - endedAt;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function formatLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
