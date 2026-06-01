"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const GLOBAL_SCOPE = "__global__";

export type LeaderboardLeague = {
  league_id: string;
  slug: string;
  name: string;
  member_count: number;
  joined_at: string;
};

type Mode = "ranked" | "daily";
type BoardState<Row> = {
  scope: string;
  mode: Mode;
  phase: "loading" | "ready" | "error";
  rows: Row[];
};

const RPCS = {
  ranked: "get_ranked_leaderboard_stats",
  daily: "get_daily_leaderboard_stats",
};

export function useLeaderboard<Row>(mode: Mode) {
  const [activeScope, setActiveScope] = useState(GLOBAL_SCOPE);
  const [leagues, setLeagues] = useState<LeaderboardLeague[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [leaguesError, setLeaguesError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState<BoardState<Row>>({
    scope: GLOBAL_SCOPE,
    mode,
    phase: "loading",
    rows: [],
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const supabase = createClient();

    (async () => {
      try {
        const [{ data: userRes }, mineRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("get_my_leagues").abortSignal(controller.signal),
        ]);
        if (cancelled) return;
        setViewerId(userRes.user?.id ?? null);
        setLeaguesError(!!mineRes.error);
        setLeagues((mineRes.data ?? []) as LeaderboardLeague[]);
      } catch {
        if (!cancelled) setLeaguesError(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const supabase = createClient();
    setBoard({ scope: activeScope, mode, phase: "loading", rows: [] });

    (async () => {
      try {
        const request = supabase.rpc(RPCS[mode], {
          league_slug: activeScope === GLOBAL_SCOPE ? null : activeScope,
        });
        const { data, error } = await request.abortSignal(controller.signal);
        if (cancelled) return;
        setBoard({
          scope: activeScope,
          mode,
          phase: error ? "error" : "ready",
          rows: error ? [] : (data ?? []) as Row[],
        });
      } catch {
        if (!cancelled) setBoard({ scope: activeScope, mode, phase: "error", rows: [] });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeScope, mode, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const isCurrent = board.scope === activeScope && board.mode === mode;

  return {
    activeScope,
    setActiveScope,
    leagues,
    viewerId,
    leaguesError,
    phase: isCurrent ? board.phase : "loading",
    rows: isCurrent ? board.rows : [],
    retry,
  };
}
