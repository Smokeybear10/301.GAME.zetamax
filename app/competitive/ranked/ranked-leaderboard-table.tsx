"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type RankedLeaderboardRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
  peak_rating: number;
  is_provisional: boolean;
  best_score: number;
  best_started_at: string | null;
  runs_played: number;
  average_score: number | null;
};

type Props = {
  rows: RankedLeaderboardRow[];
  viewerId: string | null;
  renderAction?: (row: RankedLeaderboardRow) => ReactNode;
  pendingUserId?: string | null;
};

export function RankedLeaderboardTable({ rows, viewerId, renderAction, pendingUserId }: Props) {
  return (
    <div className="min-w-0">
      <div tabIndex={0} role="region" aria-label="All-time ranked leaderboard" className="relative max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/30">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">All-time ranked results, ordered by Elo.</caption>
          <thead className="border-b border-white/10 font-mono text-[10px] font-normal tracking-[0.18em] uppercase text-white/42">
            <tr>
              <th scope="col" className="w-9 px-2 py-3 text-right font-normal">#</th>
              <th scope="col" className="min-w-[144px] px-3 py-3 font-normal">Player</th>
              <th scope="col" className="px-2 py-3 text-right font-normal" title="All-time completed, validated ranked rounds">Rounds</th>
              <th scope="col" className="px-2 py-3 text-right font-normal" title="All-time best ranked score">Best</th>
              <th scope="col" className="px-2 py-3 text-right font-normal" title="Average score across all completed, validated ranked rounds">Avg.</th>
              <th scope="col" className="px-3 py-3 text-right font-normal" title="Current Elo rating">Elo</th>
              {renderAction && <th scope="col" className="w-10 px-2 py-3 font-normal"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((row, index) => {
                const isYou = row.user_id === viewerId;
                const hasRounds = row.runs_played > 0;
                return (
                  <motion.tr
                    key={row.user_id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: row.user_id === pendingUserId ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("border-b border-white/[0.06]", isYou && "bg-white/[0.06]")}
                  >
                    <td className={cn("border-l-2 px-2 py-3 text-right font-mono tabular-nums text-white/42", isYou ? "border-white" : "border-transparent")}>{index + 1}</td>
                    <th scope="row" className={cn("max-w-[208px] px-3 py-3 font-normal", isYou ? "text-white" : "text-white/85")}>
                      <span className="block truncate" title={isYou ? "You" : row.display_name ?? "Player"}>{isYou ? "You" : row.display_name ?? "Player"}</span>
                      {row.is_provisional && <span title="Provisional — first 30 rated rounds" className="block mt-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-white/42">provisional</span>}
                    </th>
                    <td className="px-2 py-3 text-right font-mono text-xs tabular-nums text-white/65">{row.runs_played}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs tabular-nums text-white/65">{hasRounds ? row.best_score : "—"}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs tabular-nums text-white/65">{hasRounds && row.average_score !== null ? row.average_score.toFixed(1) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-white">{row.rating}</td>
                    {renderAction && <td className="px-2 py-3">{renderAction(row)}</td>}
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-white/42 sm:hidden">Scroll sideways for all stats.</p>
    </div>
  );
}
