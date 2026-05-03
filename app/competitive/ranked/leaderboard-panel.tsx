"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  best_score: number;
  best_started_at: string;
};

/**
 * "Today" boundary — America/New_York midnight matches the leaderboard RPC's
 * timezone constant. en-CA produces YYYY-MM-DD, which Postgres reads as a
 * date literal.
 */
function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function LeaderboardPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: userRes }, rpc] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_friend_leaderboard", { day: todayET() }),
      ]);
      if (cancelled) return;
      setViewerId(userRes.user?.id ?? null);
      if (rpc.error) {
        setError(rpc.error.message);
        return;
      }
      setRows((rpc.data ?? []) as Row[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
        leaderboard unavailable
      </p>
    );
  }
  if (rows === null) {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
        loading…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
        no rounds today yet — yours kicks it off
      </p>
    );
  }

  return (
    <div className="space-y-px">
      {rows.map((r, i) => {
        const isYou = r.user_id === viewerId;
        return (
          <div
            key={r.user_id}
            className={`flex items-center gap-3 px-3 py-2 ${
              isYou
                ? "bg-white/[0.06] border-l-2 border-white"
                : "border-l-2 border-transparent"
            }`}
          >
            <span className="font-mono tabular-nums text-white/42 w-6 text-right">
              {i + 1}
            </span>
            <span
              className={`flex-1 truncate ${isYou ? "text-white" : "text-white/85"}`}
            >
              {isYou ? "You" : r.display_name ?? "Player"}
            </span>
            <span className="font-mono tabular-nums text-white">
              {r.best_score}
            </span>
          </div>
        );
      })}
    </div>
  );
}
