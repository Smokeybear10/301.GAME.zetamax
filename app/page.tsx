import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHead } from "./_components/site-head";
import { StatusBar } from "./_components/status-bar";
import { KeyboardShortcuts } from "./_components/keyboard-shortcuts";
import { TransitionLink } from "./_components/transition-link";
import { YourDay } from "./home/your-day";
import { Heatmap } from "./home/heatmap";
import { Focus } from "./home/focus";

export const metadata = {
  title: "ZETAMAX | timed mental math drill",
};

type LastRanked = {
  score: number;
  completedAt: string;
  ratingDelta: number | null;
  newRating: number | null;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  rating: number;
  is_provisional: boolean;
  best_score: number;
};

type MyLeague = {
  slug: string;
  name: string;
  member_count: number;
};

type HomeData = {
  user: { id: string; displayName: string } | null;
  lastRanked: LastRanked | null;
  league: { slug: string; name: string } | null;
  leagueRows: LeaderboardRow[];
  leagueCount: number;
  dailyResetIn: string;
  dailyResetHM: { h: number; m: number };
};

async function loadHomeData(): Promise<HomeData> {
  const supabase = await createClient();
  const dailyResetHM = computeDailyResetET();
  const dailyResetIn = formatHM(dailyResetHM);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      lastRanked: null,
      league: null,
      leagueRows: [],
      leagueCount: 0,
      dailyResetIn,
      dailyResetHM,
    };
  }

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    (user.email ?? "you").split("@")[0];

  const [lastRunRes, ratingEventRes, leaguesRes] = await Promise.all([
    supabase
      .from("runs")
      .select("score, completed_at")
      .eq("user_id", user.id)
      .eq("mode", "ranked")
      .eq("validation_status", "ok")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rating_events")
      .select("after_rating, before_rating, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_my_leagues"),
  ]);

  const myLeagues = (leaguesRes.data ?? []) as MyLeague[];
  const primaryLeague = myLeagues[0]
    ? { slug: myLeagues[0].slug, name: myLeagues[0].name }
    : null;

  let leagueRows: LeaderboardRow[] = [];
  if (primaryLeague) {
    const lbRes = await supabase.rpc("get_league_leaderboard", {
      league_slug: primaryLeague.slug,
    });
    leagueRows = ((lbRes.data ?? []) as LeaderboardRow[]).slice(0, 5);
  }

  const ratingEvent = ratingEventRes.data;
  const lastRun = lastRunRes.data;
  const lastRanked: LastRanked | null = lastRun
    ? {
        score: lastRun.score ?? 0,
        completedAt: lastRun.completed_at,
        ratingDelta:
          ratingEvent && ratingEvent.after_rating != null && ratingEvent.before_rating != null
            ? ratingEvent.after_rating - ratingEvent.before_rating
            : null,
        newRating: ratingEvent?.after_rating ?? null,
      }
    : null;

  return {
    user: { id: user.id, displayName },
    lastRanked,
    league: primaryLeague,
    leagueRows,
    leagueCount: myLeagues.length,
    dailyResetIn,
    dailyResetHM,
  };
}

function computeDailyResetET(): { h: number; m: number } {
  const now = new Date();
  const etNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const etMidnight = new Date(etNow);
  etMidnight.setHours(24, 0, 0, 0);
  const ms = etMidnight.getTime() - etNow.getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

function formatHM({ h, m }: { h: number; m: number }): string {
  const mm = String(m).padStart(2, "0");
  return `${h}h ${mm}m`;
}

function formatAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default async function Home() {
  const data = await loadHomeData();

  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white antialiased">
      <div className="max-w-[1180px] mx-auto p-5">
        <SiteHead current="home" />

        <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
          <PlayRanked lastRanked={data.lastRanked} loggedIn={!!data.user} />
          <div className="flex flex-col gap-4">
            <YourDay />
            <LeaguePanel
              league={data.league}
              rows={data.leagueRows}
              userId={data.user?.id ?? null}
              loggedIn={!!data.user}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <ModeTile
            href="/practice/classic"
            badge="NO SIGN-IN"
            name="Practice"
            sub={<>local-only · nothing leaves your device</>}
            cta="drill →"
          />
          <ModeTile
            href="/competitive/daily"
            badge={`1 SHOT · ${data.dailyResetIn} LEFT`}
            name="Daily"
            sub={<>today&apos;s puzzle · 30-day mean ranks</>}
            cta="play →"
            viewTransitionName="daily-hero"
          />
          <ModeTile
            href="/competitive/leagues"
            badge={data.leagueCount > 0 ? `${data.leagueCount} ACTIVE` : "NONE YET"}
            name="Leagues"
            sub={
              data.leagueCount > 0 && data.league ? (
                <>
                  <span className="text-white">{data.league.name}</span>
                  {data.leagueCount > 1 ? ` · +${data.leagueCount - 1} more` : ""}
                </>
              ) : (
                <>data insufficient · join by link</>
              )
            }
            cta="enter →"
          />
          <ModeTile
            href="/practice/learn"
            badge="AUTO-TARGET"
            name="Learn"
            sub={<>drills your weakest pattern · local-only</>}
            cta="drill →"
          />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-4 mb-4">
          <Heatmap />
          <Focus />
        </section>

        <StatusBar />
      </div>
      <KeyboardShortcuts />
    </main>
  );
}

function PlayRanked({
  lastRanked,
  loggedIn,
}: {
  lastRanked: LastRanked | null;
  loggedIn: boolean;
}) {
  const meta = !loggedIn
    ? "sign in to play ranked"
    : lastRanked
      ? `last ranked: ${lastRanked.score} · ${formatAgo(lastRanked.completedAt)}${
          lastRanked.ratingDelta != null
            ? ` · ${lastRanked.ratingDelta >= 0 ? "↑" : "↓"}${Math.abs(lastRanked.ratingDelta)}`
            : ""
        }${lastRanked.newRating != null ? ` · ELO ${lastRanked.newRating}` : ""}`
      : "data insufficient · no ranked rounds yet";

  return (
    <TransitionLink
      href={loggedIn ? "/competitive/ranked" : "/auth/login"}
      className="group bg-white text-black p-7 sm:p-8 grid grid-rows-[auto_1fr_auto] gap-[18px] min-h-[220px] hover:opacity-95 transition-opacity"
      style={loggedIn ? ({ viewTransitionName: "ranked-hero" } as React.CSSProperties) : undefined}
    >
      <div className="flex justify-between items-baseline text-[10.5px] tracking-[0.24em] uppercase text-black/50 font-mono">
        <span>RANKED · 120s · ELO</span>
        <span>↩ enter to start</span>
      </div>
      <h1 className="font-sans font-extralight text-[clamp(46px,6.5vw,88px)] tracking-[-0.045em] leading-[0.94] text-black">
        play <span className="text-black/45">ranked</span>
        <br />
        round →
      </h1>
      <div className="flex justify-between items-baseline text-[11px] tracking-[0.04em] text-black/55 font-mono gap-4 flex-wrap">
        <span>{meta}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="border border-black/15 px-1.5 py-0.5 text-[10.5px] tracking-[0.08em] text-black">↩</span>
          start
        </span>
      </div>
    </TransitionLink>
  );
}

function LeaguePanel({
  league,
  rows,
  userId,
  loggedIn,
}: {
  league: { slug: string; name: string } | null;
  rows: LeaderboardRow[];
  userId: string | null;
  loggedIn: boolean;
}) {
  return (
    <div className="bg-[#111] border border-white/[0.12] p-[18px]">
      <div className="flex justify-between items-baseline text-[10px] tracking-[0.24em] uppercase text-white/55 mb-3 pb-2 border-b border-white/[0.08] font-mono">
        <span>
          <span className="text-white">league</span>{" "}
          {league ? `· ${league.name.toLowerCase()}` : ""}
        </span>
        <span>{rows.length > 0 ? `top ${Math.min(rows.length, 5)}` : "—"}</span>
      </div>

      {!loggedIn ? (
        <div className="py-2">
          <p className="font-mono text-[11px] text-white/42 mb-3">
            data insufficient · sign in to see league leaderboards
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center font-mono text-[10px] tracking-[0.24em] uppercase text-white border border-white/[0.12] hover:border-white/[0.28] px-3 py-1.5 transition-colors"
          >
            sign in →
          </Link>
        </div>
      ) : !league ? (
        <div className="py-2">
          <p className="font-mono text-[11px] text-white/42 mb-3">
            data insufficient · no leagues yet
          </p>
          <Link
            href="/competitive/leagues"
            className="inline-flex items-center font-mono text-[10px] tracking-[0.24em] uppercase text-white border border-white/[0.12] hover:border-white/[0.28] px-3 py-1.5 transition-colors"
          >
            join a league →
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[11px] text-white/42 py-3">
          data insufficient · no qualifying runs in this league yet
        </p>
      ) : (
        <ol>
          {rows.map((r, i) => {
            const isMe = r.user_id === userId;
            const last = i === rows.length - 1;
            return (
              <li
                key={r.user_id}
                className={
                  "grid grid-cols-[18px_1fr_auto_auto] gap-3 items-baseline py-1.5 text-[13px] font-mono " +
                  (last ? "" : "border-b border-white/[0.08] ") +
                  (isMe ? "-mx-[18px] px-[18px] bg-white/[0.04]" : "")
                }
              >
                <span className={"text-[11px] " + (isMe ? "" : "text-white/55")}>
                  {isMe && (
                    <span className="text-white text-[9px] mr-0.5">▶</span>
                  )}
                  {i + 1}
                </span>
                <span
                  className={
                    "font-sans text-[13px] truncate " +
                    (isMe ? "text-white font-medium" : "text-white/85")
                  }
                >
                  {isMe ? "You" : r.display_name ?? "Player"}
                </span>
                <span className="text-[11px] text-white/42" title="best in last 30 days">
                  {r.best_score}
                </span>
                <span
                  className="text-[14px] tabular-nums font-medium text-white"
                  title="ELO"
                >
                  {r.rating}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ModeTile({
  href,
  badge,
  name,
  sub,
  cta,
  viewTransitionName,
}: {
  href: string;
  badge: string;
  name: string;
  sub: React.ReactNode;
  cta: string;
  viewTransitionName?: string;
}) {
  return (
    <TransitionLink
      href={href}
      className="group bg-[#111] border border-white/[0.12] p-[18px] pb-4 flex flex-col justify-between min-h-[130px] hover:border-white/[0.28] hover:bg-[#16161a] transition-colors"
      style={
        viewTransitionName
          ? ({ viewTransitionName } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex justify-end text-[10px] tracking-[0.24em] uppercase text-white/42 font-mono">
        <span className="truncate">{badge}</span>
      </div>
      <div>
        <div className="font-sans font-extralight text-[32px] tracking-[-0.025em] leading-none text-white mt-1.5">
          {name}
        </div>
        <div className="text-[11.5px] text-white/55 mt-2.5 font-mono">{sub}</div>
      </div>
      <div className="text-[11px] text-white/42 group-hover:text-white transition-colors mt-2.5 font-mono">
        {cta}
      </div>
    </TransitionLink>
  );
}

