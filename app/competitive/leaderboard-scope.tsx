"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { GLOBAL_SCOPE, type LeaderboardLeague } from "./use-leaderboard";

type Props = {
  activeScope: string;
  leagues: LeaderboardLeague[];
  onChange: (scope: string) => void;
  leaguesError: boolean;
  onRetry: () => void;
};

export function LeaderboardScope({ activeScope, leagues, onChange, leaguesError, onRetry }: Props) {
  const choices = [{ slug: GLOBAL_SCOPE, name: "Global" }, ...leagues];

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Leaderboard scope">
        {choices.map((choice) => (
          <button
            key={choice.slug}
            type="button"
            aria-pressed={choice.slug === activeScope}
            onClick={() => onChange(choice.slug)}
            className={cn(
              "px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase border transition-colors",
              choice.slug === activeScope
                ? "border-white text-white"
                : "border-white/10 text-white/42 hover:text-white hover:border-white/30",
            )}
          >
            {choice.name}
          </button>
        ))}
        <Link href="/competitive/leagues" className="ml-auto font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white">
          your leagues →
        </Link>
      </div>
      {leaguesError && (
        <p className="mt-3 font-mono text-[11px] text-white/65" role="status">
          Personal leagues unavailable. <button type="button" onClick={onRetry} className="underline underline-offset-4 hover:text-white">Retry</button>
        </p>
      )}
    </div>
  );
}
