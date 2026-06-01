"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LeaderboardScope } from "../leaderboard-scope";
import { GLOBAL_SCOPE, useLeaderboard } from "../use-leaderboard";

type Row = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  mean_duration_ms: number | null;
  best_duration_ms: number | null;
  runs_completed: number;
  runs_forfeited: number;
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DailyLeaderboardPanel() {
  const {
    activeScope,
    setActiveScope,
    leagues,
    viewerId,
    leaguesError,
    phase,
    rows,
    retry,
  } = useLeaderboard<Row>("daily");
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
        {isGlobal ? "Top 100 by average completion time · all-time results" : "Ranked by average completion time · all-time results"}
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
          {isGlobal ? "No completed daily rounds yet." : "No completed daily runs in this league yet."}
        </p>
      ) : (
        <div tabIndex={0} role="region" aria-label="All-time daily leaderboard" className="relative max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/30">
          <table className="w-full min-w-[500px] border-collapse text-left">
            <caption className="sr-only">All-time daily results, ordered by average completion time.</caption>
            <thead className="border-y border-white/10 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42">
              <tr>
                <th scope="col" className="w-9 px-2 py-3 text-right font-normal">#</th>
                <th scope="col" className="min-w-[144px] px-3 py-3 font-normal">Player</th>
                <th scope="col" className="px-2 py-3 text-right font-normal" title="All-time completed daily rounds">Done</th>
                <th scope="col" className="px-2 py-3 text-right font-normal" title="All-time fastest completed daily round">Best time</th>
                <th scope="col" className="px-3 py-3 text-right font-normal" title="Average time across all completed daily rounds">Avg. time</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => {
                  const isYou = r.user_id === viewerId;
                  return (
                    <motion.tr
                      key={r.user_id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      className={cn("border-b border-white/10", isYou && "bg-white/[0.06]")}
                    >
                      <td className={cn("border-l-2 px-2 py-3 font-mono tabular-nums text-white/42 text-right", isYou ? "border-white" : "border-transparent")}>
                        {i + 1}
                      </td>
                      <th scope="row" className={cn("max-w-[208px] px-3 py-3 font-normal", isYou ? "text-white" : "text-white/85")}>
                        <span className="block truncate" title={isYou ? "You" : r.display_name ?? "Player"}>{isYou ? "You" : r.display_name ?? "Player"}</span>
                      </th>
                      <td
                        className="px-2 py-3 font-mono tabular-nums text-white/65 text-xs text-right"
                      >
                        {r.runs_completed}
                      </td>
                      <td className="px-2 py-3 font-mono tabular-nums text-white/65 text-xs text-right">
                        {r.runs_completed > 0 && r.best_duration_ms !== null ? formatTime(r.best_duration_ms) : "—"}
                      </td>
                      <td
                        className="px-3 py-3 font-mono tabular-nums text-white text-right"
                      >
                        {r.runs_completed > 0 && r.mean_duration_ms !== null ? formatTime(r.mean_duration_ms) : "—"}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
