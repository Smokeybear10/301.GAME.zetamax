import Link from "next/link";
import { SiteHead } from "@/app/_components/site-head";
import { cn } from "@/lib/utils";
import { LeaderboardPanel } from "../ranked/leaderboard-panel";
import { DailyLeaderboardPanel } from "../daily/daily-leaderboard-panel";

export const metadata = {
  title: "ZETAMAX | Leaderboards",
};

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const daily = mode === "daily";

  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white antialiased">
      <div className="max-w-[1180px] mx-auto p-5">
        <SiteHead />
        <div className="max-w-2xl mx-auto py-8 sm:py-12">
          <header className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.24em] uppercase text-white/42 mb-4">
              Global + leagues
            </p>
            <h1 className="font-extralight text-4xl tracking-[-0.025em]">Leaderboards</h1>
          </header>

          <nav aria-label="Leaderboard mode" className="flex gap-6 border-b border-white/10 mb-6">
            {([
              { label: "Ranked", href: "/competitive/leaderboards", active: !daily },
              { label: "Daily", href: "/competitive/leaderboards?mode=daily", active: daily },
            ] as const).map(({ label, href, active }) => (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-mono text-[11px] tracking-[0.18em] uppercase py-3 border-b transition-colors",
                  active ? "text-white border-white" : "text-white/42 border-transparent hover:text-white",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {daily ? <DailyLeaderboardPanel /> : <LeaderboardPanel />}

          <div className="mt-8 pt-5 border-t border-white/10 text-center">
            <Link
              href={daily ? "/competitive/daily" : "/competitive/ranked"}
              className="inline-flex border border-white/20 px-4 py-2 font-mono text-[11px] tracking-[0.18em] uppercase hover:border-white transition-colors"
            >
              {daily ? "play daily →" : "play ranked →"}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
