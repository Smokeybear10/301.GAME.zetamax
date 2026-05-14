import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHead } from "@/app/_components/site-head";
import { StatusBar } from "@/app/_components/status-bar";
import { KeyboardShortcuts } from "@/app/_components/keyboard-shortcuts";

export const metadata = {
  title: "Competitive — Zetamax",
};

type CompetitiveData = {
  loggedIn: boolean;
  rating: number | null;
  isProvisional: boolean;
  lastRanked: { score: number; completedAt: string } | null;
  todaysDaily: { score: number | null; status: string } | null;
  leagueCount: number;
  primaryLeague: { slug: string; name: string } | null;
  dailyResetIn: string;
};

async function loadData(): Promise<CompetitiveData> {
  const supabase = await createClient();
  const dailyResetIn = formatHM(computeDailyResetET());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      loggedIn: false,
      rating: null,
      isProvisional: false,
      lastRanked: null,
      todaysDaily: null,
      leagueCount: 0,
      primaryLeague: null,
      dailyResetIn,
    };
  }

  const today = formatTodayET();
  const [ratingRes, lastRankedRes, todaysDailyRes, leaguesRes] = await Promise.all([
    supabase
      .from("user_ratings")
      .select("rating, peak_rating, runs_played")
      .eq("user_id", user.id)
      .maybeSingle(),
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
      .from("runs")
      .select("score, validation_status")
      .eq("user_id", user.id)
      .eq("mode", "daily")
      .eq("daily_date", today)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_my_leagues"),
  ]);

  const ratingRow = ratingRes.data as { rating: number; runs_played: number } | null;
  const myLeagues = (leaguesRes.data ?? []) as Array<{
    slug: string;
    name: string;
    member_count: number;
  }>;

  return {
    loggedIn: true,
    rating: ratingRow?.rating ?? null,
    isProvisional: (ratingRow?.runs_played ?? 0) < 30,
    lastRanked: lastRankedRes.data
      ? { score: lastRankedRes.data.score ?? 0, completedAt: lastRankedRes.data.completed_at }
      : null,
    todaysDaily: todaysDailyRes.data
      ? {
          score: todaysDailyRes.data.score,
          status: todaysDailyRes.data.validation_status,
        }
      : null,
    leagueCount: myLeagues.length,
    primaryLeague: myLeagues[0]
      ? { slug: myLeagues[0].slug, name: myLeagues[0].name }
      : null,
    dailyResetIn,
  };
}

function computeDailyResetET(): { h: number; m: number } {
  const now = new Date();
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const etMidnight = new Date(etNow);
  etMidnight.setHours(24, 0, 0, 0);
  const ms = etMidnight.getTime() - etNow.getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

function formatHM({ h, m }: { h: number; m: number }): string {
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatTodayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function CompetitiveMenu() {
  const data = await loadData();

  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white antialiased">
      <div className="max-w-[1180px] mx-auto p-5">
        <SiteHead current="competitive" />

        <header className="px-2 mb-7 mt-3">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3">
            Competitive
          </p>
          <h1 className="font-sans font-extralight text-3xl sm:text-4xl tracking-[-0.025em] leading-[1.05] text-white max-w-[24ch]">
            Server-validated rounds. ELO, daily, leagues.
          </h1>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RankedTile data={data} />
          <DailyTile data={data} />
          <LeaguesTile data={data} />
          <RaceTile />
        </section>

        <div className="mt-4">
          <StatusBar />
        </div>
      </div>
      <KeyboardShortcuts />
    </main>
  );
}

function RankedTile({ data }: { data: CompetitiveData }) {
  const meta = !data.loggedIn
    ? "sign in to play ranked"
    : data.lastRanked
      ? `last: ${data.lastRanked.score} · ${formatAgo(data.lastRanked.completedAt)}`
      : "data insufficient · no ranked rounds yet";

  return (
    <Link
      href={data.loggedIn ? "/competitive/ranked" : "/auth/login"}
      className="group bg-white text-black p-7 grid grid-rows-[auto_1fr_auto] gap-4 min-h-[220px] hover:opacity-95 transition-opacity"
    >
      <div className="flex justify-between items-baseline text-[10.5px] tracking-[0.24em] uppercase text-black/50 font-mono">
        <span>Ranked · 120s · ELO</span>
        <span>↩ enter</span>
      </div>
      <h2 className="font-sans font-extralight text-[clamp(40px,5.4vw,72px)] tracking-[-0.04em] leading-[0.94] text-black">
        Play ranked
        <br />
        round →
      </h2>
      <div className="flex justify-between items-baseline text-[11px] tracking-[0.04em] text-black/55 font-mono gap-4 flex-wrap">
        <span>{meta}</span>
        {data.rating != null && (
          <span>
            <span className="text-black/45 text-[10px] tracking-[0.18em] uppercase mr-1.5">elo</span>
            <span className="text-black font-medium">{data.rating}</span>
            {data.isProvisional && (
              <span className="text-black/45 text-[10px] tracking-[0.18em] uppercase ml-2">prov</span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}

function DailyTile({ data }: { data: CompetitiveData }) {
  const played = data.todaysDaily != null && data.todaysDaily.score != null;
  const meta = !data.loggedIn
    ? "sign in · one shot per day"
    : played
      ? `today: ${data.todaysDaily?.score} · 30-day mean ranks`
      : "data insufficient · you haven't played today";

  return (
    <Link
      href={data.loggedIn ? "/competitive/daily" : "/auth/login"}
      className="group bg-[#111] border border-white/[0.12] p-6 sm:p-7 grid grid-rows-[auto_1fr_auto] gap-4 min-h-[220px] hover:border-white/[0.28] hover:bg-[#16161a] transition-colors"
    >
      <div className="flex justify-between items-baseline text-[10.5px] tracking-[0.24em] uppercase text-white/42 font-mono">
        <span>Daily · 1 shot · 30-day mean</span>
        <span>{data.dailyResetIn} left</span>
      </div>
      <h2 className="font-sans font-extralight text-[clamp(40px,5.4vw,72px)] tracking-[-0.04em] leading-[0.94] text-white">
        Daily puzzle →
      </h2>
      <div className="flex justify-between items-baseline text-[11px] tracking-[0.04em] text-white/55 font-mono gap-4 flex-wrap">
        <span>{meta}</span>
        <span className="text-white/42 text-[10px] tracking-[0.18em] uppercase">
          ↩ {played ? "view board" : "play"}
        </span>
      </div>
    </Link>
  );
}

function LeaguesTile({ data }: { data: CompetitiveData }) {
  const meta = !data.loggedIn
    ? "sign in to see leagues"
    : data.leagueCount === 0
      ? "data insufficient · join one by link, or create"
      : data.primaryLeague
        ? `${data.primaryLeague.name}${data.leagueCount > 1 ? ` · +${data.leagueCount - 1} more` : ""}`
        : "ready";

  return (
    <Link
      href={data.loggedIn ? "/competitive/leagues" : "/auth/login"}
      className="group bg-[#111] border border-white/[0.12] p-6 sm:p-7 grid grid-rows-[auto_1fr_auto] gap-4 min-h-[220px] hover:border-white/[0.28] hover:bg-[#16161a] transition-colors"
    >
      <div className="flex justify-between items-baseline text-[10.5px] tracking-[0.24em] uppercase text-white/42 font-mono">
        <span>Leagues · friend groups</span>
        <span>{data.leagueCount > 0 ? `${data.leagueCount} active` : "none yet"}</span>
      </div>
      <h2 className="font-sans font-extralight text-[clamp(40px,5.4vw,72px)] tracking-[-0.04em] leading-[0.94] text-white">
        Your leagues →
      </h2>
      <div className="flex justify-between items-baseline text-[11px] tracking-[0.04em] text-white/55 font-mono gap-4 flex-wrap">
        <span>{meta}</span>
        <span className="text-white/42 text-[10px] tracking-[0.18em] uppercase">enter</span>
      </div>
    </Link>
  );
}

function RaceTile() {
  return (
    <div
      aria-disabled
      className="bg-[#111] border border-white/[0.07] p-6 sm:p-7 grid grid-rows-[auto_1fr_auto] gap-4 min-h-[220px] opacity-50 select-none cursor-not-allowed"
    >
      <div className="flex justify-between items-baseline text-[10.5px] tracking-[0.24em] uppercase text-white/42 font-mono">
        <span>Race · live 1v1</span>
        <span>soon</span>
      </div>
      <h2 className="font-sans font-extralight text-[clamp(40px,5.4vw,72px)] tracking-[-0.04em] leading-[0.94] text-white/55">
        Race
        <br />
        (soon)
      </h2>
      <div className="flex justify-between items-baseline text-[11px] tracking-[0.04em] text-white/42 font-mono gap-4 flex-wrap">
        <span>same problem stream, same clock</span>
        <span className="text-[10px] tracking-[0.18em] uppercase">coming</span>
      </div>
    </div>
  );
}
