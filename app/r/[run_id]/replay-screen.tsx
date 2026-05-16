"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ZETAMAC_DEFAULTS,
  generateProblem,
  hashString,
  type AnswerEvent,
  type Problem,
} from "@/lib/drill";
import { createClient } from "@/lib/supabase/client";
import { ZpButton } from "@/components/ui/zp-button";

const OP_SYMBOL: Record<Problem["op"], string> = {
  add: "+", sub: "−", mul: "×", div: "÷",
};

type RunRow = {
  id: string;
  seed: string;
  score: number | null;
  started_at: string;
  completed_at: string | null;
  validation_status: string;
  mode: string;
  daily_date: string | null;
  client_payload: { events?: AnswerEvent[] } | null;
};

type Phase =
  | { tag: "loading" }
  | { tag: "not-found" }
  | { tag: "ready"; run: RunRow; events: AnswerEvent[]; problems: Problem[]; totalMs: number };

function parseProblemIndex(problemId: string): number {
  const m = problemId.match(/^p(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Walk the keystrokes of the event up to elapsed-ms-into-this-problem and
 * return the typed string at that moment. Pure — drives the typed display.
 */
function typedAt(event: AnswerEvent, tInProblem: number): string {
  let typed = "";
  for (const k of event.keystrokes) {
    if (k.t > tInProblem) break;
    if (k.key === "Backspace") typed = typed.slice(0, -1);
    else if (/^\d$/.test(k.key)) typed += k.key;
    // submit/skip don't change typed display before commit
  }
  return typed;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReplayScreen({ runId }: { runId: string }) {
  const [phase, setPhase] = useState<Phase>({ tag: "loading" });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startWallRef = useRef<number | null>(null);
  const pausedAtRef = useRef(0);

  // Fetch the run and its persisted events on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("runs")
        .select(
          "id, seed, score, started_at, completed_at, validation_status, mode, daily_date, client_payload",
        )
        .eq("id", runId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setPhase({ tag: "not-found" });
        return;
      }
      const run = data as RunRow;
      const events = (run.client_payload?.events ?? []) as AnswerEvent[];
      if (events.length === 0) {
        setPhase({ tag: "not-found" });
        return;
      }
      const seedHash = hashString(run.seed);
      const problems = events.map((e) =>
        generateProblem(
          seedHash,
          parseProblemIndex(e.problemId),
          ZETAMAC_DEFAULTS,
        ),
      );
      const totalMs = events[events.length - 1].submittedAt;
      setPhase({ tag: "ready", run, events, problems, totalMs });
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Timer loop driven by rAF when playing.
  useEffect(() => {
    if (!playing) return;
    if (phase.tag !== "ready") return;
    startWallRef.current = performance.now() - pausedAtRef.current;
    let raf = 0;
    const tick = () => {
      const wall = performance.now();
      const elapsed = wall - (startWallRef.current ?? wall);
      if (elapsed >= phase.totalMs) {
        setElapsedMs(phase.totalMs);
        pausedAtRef.current = phase.totalMs;
        setPlaying(false);
        return;
      }
      setElapsedMs(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pausedAtRef.current = elapsedMs;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, phase.tag]);

  const onPlayPause = useCallback(() => {
    if (phase.tag !== "ready") return;
    if (elapsedMs >= phase.totalMs) {
      // Auto-restart on play after end
      pausedAtRef.current = 0;
      setElapsedMs(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [phase, elapsedMs]);

  const onRestart = useCallback(() => {
    setPlaying(false);
    pausedAtRef.current = 0;
    setElapsedMs(0);
  }, []);

  // Pre-compute current problem + typed string from elapsedMs
  const view = useMemo(() => {
    if (phase.tag !== "ready") return null;
    const { events, problems } = phase;
    let idx = 0;
    for (let i = 0; i < events.length; i++) {
      if (events[i].submittedAt > elapsedMs) {
        idx = i;
        break;
      }
      idx = i + 1;
    }
    if (idx >= events.length) {
      // Past the end — show last problem locked in
      const last = events[events.length - 1];
      return {
        problemIdx: events.length - 1,
        problem: problems[problems.length - 1],
        typed: last.typed,
        score: events.filter((e) => e.correct).length,
      };
    }
    const event = events[idx];
    const problemStartMs = idx === 0 ? 0 : events[idx - 1].submittedAt;
    const tInProblem = Math.max(0, elapsedMs - problemStartMs);
    const typed = typedAt(event, tInProblem);
    const score = events.slice(0, idx).filter((e) => e.correct).length;
    return { problemIdx: idx, problem: problems[idx], typed, score };
  }, [phase, elapsedMs]);

  if (phase.tag === "loading") {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
          loading replay…
        </p>
      </main>
    );
  }

  if (phase.tag === "not-found") {
    return <NotFoundState />;
  }

  const { run, events, totalMs } = phase;
  const modeLabel =
    run.mode === "daily" && run.daily_date
      ? `daily · ${run.daily_date}`
      : run.mode;

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col select-none antialiased">
      <header className="grid grid-cols-3 items-center px-8 pt-8 font-mono text-sm font-light tabular-nums">
        <span className="text-white text-left">{view?.score ?? 0}</span>
        <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 text-center">
          replay · {modeLabel}
        </span>
        <span className="text-white/65 text-right">
          {formatTime(elapsedMs)} / {formatTime(totalMs)}
        </span>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {view && (
          <>
            <div
              aria-hidden="true"
              className="font-extralight tracking-[-0.05em] leading-none text-[clamp(72px,15vw,200px)] whitespace-nowrap"
            >
              {view.problem.a}
              <span className="text-white/42 font-extralight mx-[0.18em]">
                {OP_SYMBOL[view.problem.op]}
              </span>
              {view.problem.b}
            </div>
            <div className="font-black tracking-[-0.05em] leading-none text-[clamp(72px,15vw,200px)] flex items-center min-h-[1.05em]">
              <span>{view.typed}</span>
            </div>
          </>
        )}
      </section>

      <div className="px-6 pb-2">
        <Timeline events={events} totalMs={totalMs} elapsedMs={elapsedMs} />
      </div>

      <div className="flex items-center justify-center gap-3 pb-3 pt-3">
        <ZpButton variant="primary" size="sm" onClick={onPlayPause}>
          {playing ? "Pause" : elapsedMs >= totalMs ? "Replay" : "Play"}
        </ZpButton>
        <ZpButton variant="secondary" size="sm" onClick={onRestart}>
          Restart
        </ZpButton>
      </div>
      {run.mode === "ranked" && (
        <div className="flex justify-center pb-8">
          <Link
            href={`/competitive/race/${run.id}`}
            className="font-mono text-[10px] tracking-[0.24em] uppercase text-white/55 hover:text-white border border-white/[0.12] hover:border-white/[0.28] px-4 py-2 transition-colors"
          >
            race their ghost →
          </Link>
        </div>
      )}

      <ZpButton asChild variant="floating">
        <Link href="/me" aria-label="Back to my profile">
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">profile</span>
        </Link>
      </ZpButton>
    </main>
  );
}

function Timeline({
  events,
  totalMs,
  elapsedMs,
}: {
  events: AnswerEvent[];
  totalMs: number;
  elapsedMs: number;
}) {
  // Latency-based brightness ramp — slower problems are brighter (they stand
  // out as the "weak" cells on the timeline). Same intuition as the mul fact
  // heatmap.
  const latencies = events.map((e) => e.latencyMs);
  const minLat = Math.min(...latencies);
  const maxLat = Math.max(...latencies);
  const range = Math.max(1, maxLat - minLat);

  return (
    <div className="relative h-3 bg-white/[0.03] flex" role="img" aria-label="round timeline">
      {events.map((e, i) => {
        const start = i === 0 ? 0 : events[i - 1].submittedAt;
        const widthPct = ((e.submittedAt - start) / totalMs) * 100;
        const t = (e.latencyMs - minLat) / range;
        const opacity = 0.18 + t * 0.7;
        return (
          <div
            key={i}
            className="border-r border-black/40 last:border-r-0"
            style={{
              width: `${widthPct}%`,
              backgroundColor: e.correct
                ? `rgba(255,255,255,${opacity})`
                : `rgba(255, 93, 93, ${Math.max(0.4, opacity)})`,
            }}
            title={`#${i + 1}: ${e.correct ? "✓" : "✗"} ${Math.round(e.latencyMs)}ms`}
          />
        );
      })}
      {/* Playhead */}
      <div
        className="absolute top-[-2px] bottom-[-2px] w-px bg-white"
        style={{ left: `${Math.min(100, (elapsedMs / totalMs) * 100)}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function NotFoundState() {
  return (
    <main className="min-h-screen bg-black text-white antialiased flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
          Replay unavailable
        </p>
        <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] mb-4">
          That run isn&apos;t replayable.
        </h1>
        <p className="text-white/65 mb-8 leading-relaxed">
          The run might not exist, you may not have access to it, or it
          predates the replay feature.
        </p>
        <ZpButton asChild variant="chip">
          <Link href="/me">back to profile</Link>
        </ZpButton>
      </div>
    </main>
  );
}
