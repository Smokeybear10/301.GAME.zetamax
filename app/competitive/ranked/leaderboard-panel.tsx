"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MyLeague = {
  league_id: string;
  slug: string;
  name: string;
  member_count: number;
  joined_at: string;
};

type Row = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  best_score: number;
  best_started_at: string | null;
  runs_played: number;
};

const PREFERRED_LEAGUE_KEY = "zetamax:preferred-league-slug";

function readPreferredSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_LEAGUE_KEY);
  } catch {
    return null;
  }
}

function writePreferredSlug(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_LEAGUE_KEY, slug);
  } catch {
    // private mode / quota — silent
  }
}

export function LeaderboardPanel() {
  const [phase, setPhase] = useState<"loading" | "ready" | "no-leagues" | "error">(
    "loading",
  );
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the user's leagues + viewer id once.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: userRes }, mineRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_my_leagues"),
      ]);
      if (cancelled) return;
      setViewerId(userRes.user?.id ?? null);
      if (mineRes.error) {
        setError(mineRes.error.message);
        setPhase("error");
        return;
      }
      const mine = (mineRes.data ?? []) as MyLeague[];
      setLeagues(mine);
      if (mine.length === 0) {
        setPhase("no-leagues");
        return;
      }
      const remembered = readPreferredSlug();
      const initial =
        (remembered && mine.find((l) => l.slug === remembered)?.slug) ??
        mine[0].slug;
      setActiveSlug(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the leaderboard for whichever league is active.
  const loadBoard = useCallback(async (slug: string) => {
    setRows(null);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_league_leaderboard", {
      league_slug: slug,
    });
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    if (!activeSlug) return;
    setPhase("ready");
    writePreferredSlug(activeSlug);
    loadBoard(activeSlug);
  }, [activeSlug, loadBoard]);

  if (phase === "loading") {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
        loading…
      </p>
    );
  }

  if (phase === "no-leagues") {
    return (
      <div className="text-center">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 mb-4">
          no leagues yet
        </p>
        <Link
          href="/competitive/leagues"
          className="inline-block px-5 py-2 border border-white/15 hover:border-white text-white/65 hover:text-white transition-colors font-mono text-[11px] tracking-[0.18em] uppercase"
        >
          join a league →
        </Link>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
        leaderboard unavailable
      </p>
    );
  }

  return (
    <div>
      {leagues.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {leagues.map((l) => {
            const active = l.slug === activeSlug;
            return (
              <button
                key={l.slug}
                type="button"
                onClick={() => setActiveSlug(l.slug)}
                className={`px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase border transition-colors ${
                  active
                    ? "border-white text-white"
                    : "border-white/10 text-white/42 hover:text-white hover:border-white/30"
                }`}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      {rows === null ? (
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
          loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
          no qualifying runs in this league yet — yours kicks it off
        </p>
      ) : (
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
                  className={`flex-1 truncate ${
                    isYou ? "text-white" : "text-white/85"
                  }`}
                >
                  {isYou ? "You" : r.display_name ?? "Player"}
                </span>
                <span className="font-mono tabular-nums text-white/42 text-[10px] tracking-[0.18em] uppercase whitespace-nowrap">
                  {r.runs_played}
                </span>
                <span className="font-mono tabular-nums text-white">
                  {r.best_score}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error && rows !== null && (
        <p className="font-mono text-[11px] text-white/65 mt-3 text-center">
          {error}
        </p>
      )}
    </div>
  );
}
