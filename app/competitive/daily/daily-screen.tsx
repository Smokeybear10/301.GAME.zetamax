"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  last30DailyDates,
  todayET,
  DAILY_WINDOW_DAYS,
} from "@/lib/drill/daily-seed";
import { ZpButton } from "@/components/ui/zp-button";
import { DailyLeaderboardPanel } from "./daily-leaderboard-panel";

type DailyRow = {
  daily_date: string;
  validation_status: string;
  duration_ms: number | null;
};

type Status = "available" | "completed" | "forfeited" | "pending";

type DayCell = {
  iso: string;
  status: Status;
  durationMs: number | null;
  isToday: boolean;
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Phase = "loading" | "ready" | "signed-out" | "error";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

function statusFromRow(s: string): Status {
  if (s === "ok") return "completed";
  if (s === "forfeited") return "forfeited";
  if (s === "pending") return "pending";
  return "forfeited"; // rejected_* / abandoned all bucket as "you can't retry"
}

export function DailyScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [today, setToday] = useState<string>("");
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setPhase("signed-out");
      return;
    }
    const t = todayET();
    setToday(t);

    const minDate = last30DailyDates(t)[0];
    const { data, error: queryError } = await supabase
      .from("runs")
      .select("daily_date, validation_status, duration_ms")
      .eq("user_id", user.id)
      .eq("mode", "daily")
      .gte("daily_date", minDate);

    if (queryError) {
      setError(queryError.message);
      setPhase("error");
      return;
    }
    setRows((data ?? []) as DailyRow[]);
    setPhase("ready");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cells: DayCell[] = useMemo(() => {
    if (!today) return [];
    const map = new Map<string, DailyRow>();
    for (const r of rows) {
      if (r.daily_date) map.set(r.daily_date, r);
    }
    return last30DailyDates(today).map((iso) => {
      const r = map.get(iso);
      return {
        iso,
        status: r ? statusFromRow(r.validation_status) : "available",
        durationMs: r?.duration_ms ?? null,
        isToday: iso === today,
      };
    });
  }, [today, rows]);

  return (
    <main
      className="min-h-screen bg-black text-white antialiased"
      style={{ viewTransitionName: "daily-hero" } as React.CSSProperties}
    >
      <ZpButton asChild variant="chip" className="absolute top-6 left-6">
        <Link href="/" aria-label="Back to home">← home</Link>
      </ZpButton>

      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
        <header className="mb-10 sm:mb-12">
          <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
            Daily
          </p>
          <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-tight mb-3">
            One puzzle. Every friend.
          </h1>
          <p className="text-white/65 leading-relaxed max-w-md">
            Same problems for everyone today. One shot per day — reload mid-round
            forfeits the day. Past days you missed are still playable.
          </p>
        </header>

        {phase === "loading" && (
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
            loading…
          </p>
        )}

        {phase === "signed-out" && (
          <div className="border border-white/10 p-6 text-center">
            <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
              Signed out
            </p>
            <p className="text-white/65 mb-6">Sign in to play the Daily.</p>
            <ZpButton asChild variant="primary">
              <Link href="/auth/login">Continue with Google</Link>
            </ZpButton>
          </div>
        )}

        {phase === "error" && error && (
          <p className="font-mono text-[11px] text-white/65">{error}</p>
        )}

        {phase === "ready" && (
          <div className="space-y-12 sm:space-y-14">
            <section>
              <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-4">
                Mean · last {DAILY_WINDOW_DAYS} days
              </h2>
              <DailyLeaderboardPanel />
            </section>

            <section>
              <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-4">
                Days · oldest first
              </h2>
              <div className="border-t border-b border-white/10 divide-y divide-white/10">
                {cells.map((c) => (
                  <DayRow key={c.iso} cell={c} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function DayRow({ cell }: { cell: DayCell }) {
  const playable = cell.status === "available";
  const label = formatLabel(cell.iso);

  const inner = (
    <div
      className={`grid grid-cols-[5rem_1fr_auto] items-center gap-3 sm:gap-4 px-3 py-3 ${
        cell.isToday
          ? "bg-white/[0.06] border-l-2 border-white -ml-[2px]"
          : "border-l-2 border-transparent -ml-[2px]"
      }`}
    >
      <span
        className={`font-mono text-sm tabular-nums ${
          cell.isToday ? "text-white" : "text-white/85"
        }`}
      >
        {label}
        {cell.isToday && (
          <span className="ml-2 font-mono text-[10px] tracking-[0.18em] uppercase text-white/65">
            today
          </span>
        )}
      </span>
      <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        {cell.status === "available" && "open"}
        {cell.status === "completed" && (
          <>
            done ·{" "}
            <span className="tabular-nums text-white">
              {cell.durationMs !== null ? formatTime(cell.durationMs) : "—"}
            </span>
          </>
        )}
        {cell.status === "forfeited" && "forfeited"}
        {cell.status === "pending" && "in progress…"}
      </span>
      <span
        aria-hidden="true"
        className={`font-mono text-[10px] tracking-[0.18em] uppercase ${
          playable ? "text-white/65" : "text-transparent"
        }`}
      >
        play →
      </span>
    </div>
  );

  if (playable) {
    return (
      <Link
        href={`/competitive/daily/${cell.iso}`}
        className="block hover:bg-white/[0.03] transition-colors"
      >
        {inner}
      </Link>
    );
  }
  if (cell.status === "pending") {
    return (
      <Link
        href={`/competitive/daily/${cell.iso}`}
        className="block hover:bg-white/[0.03] transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
