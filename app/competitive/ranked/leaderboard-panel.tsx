"use client";

import { LeaderboardScope } from "../leaderboard-scope";
import { GLOBAL_SCOPE, useLeaderboard } from "../use-leaderboard";
import { RankedLeaderboardTable, type RankedLeaderboardRow } from "./ranked-leaderboard-table";

export function LeaderboardPanel() {
  const {
    activeScope,
    setActiveScope,
    leagues,
    viewerId,
    leaguesError,
    phase,
    rows,
    retry,
  } = useLeaderboard<RankedLeaderboardRow>("ranked");
  const isGlobal = activeScope === GLOBAL_SCOPE;

  return (
    <div>
      <LeaderboardScope
        activeScope={activeScope}
        leagues={leagues}
        onChange={setActiveScope}
        leaguesError={leaguesError}
        onRetry={retry}
      />
      <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-white/42 mb-4">
        {isGlobal ? "Top 100 by Elo · all-time results" : "Ranked by Elo · all-time results"}
      </p>

      {phase === "loading" ? (
        <p role="status" className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
          loading…
        </p>
      ) : phase === "error" ? (
        <div className="text-center" role="status">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">leaderboard unavailable</p>
          <button type="button" onClick={retry} className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-white/65 underline underline-offset-4 hover:text-white">
            retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 text-center">
          {isGlobal ? "No qualifying ranked rounds yet." : "No qualifying runs in this league yet."}
        </p>
      ) : (
        <RankedLeaderboardTable rows={rows} viewerId={viewerId} />
      )}
    </div>
  );
}
