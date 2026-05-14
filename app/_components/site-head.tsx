import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Current = "home" | "about" | "practice" | "competitive" | "me" | null;

export async function SiteHead({
  subline,
  current = null,
}: {
  subline?: React.ReactNode;
  current?: Current;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user
    ? ((user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        (user.email ?? "you").split("@")[0])
    : null;

  return (
    <header className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 sm:gap-7 px-[18px] py-3.5 bg-[#111] border border-white/[0.12] mb-4">
      <Link
        href="/"
        className="font-sans text-[22px] leading-none tracking-[-0.04em] text-white"
      >
        <span className="font-extralight">zeta</span>
        <span className="font-black">max</span>
      </Link>
      <span className="text-[11px] text-white/55 tracking-[0.04em] hidden sm:block font-mono">
        {subline ?? <DefaultSubline />}
      </span>
      <HeadLink href="/about" active={current === "about"} className="hidden sm:inline-flex">
        about
      </HeadLink>
      <HeadLink href="/practice/classic" active={current === "practice"} className="hidden md:inline-flex">
        practice
      </HeadLink>
      <HeadLink href="/competitive" active={current === "competitive"} className="hidden md:inline-flex">
        compete
      </HeadLink>
      {displayName ? (
        <Link
          href="/me"
          className={
            "flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase border px-3.5 py-1.5 transition-colors font-mono " +
            (current === "me"
              ? "text-white border-white"
              : "text-white border-white/[0.12] hover:border-white/[0.28]")
          }
        >
          <span className="block w-1.5 h-1.5 bg-white rounded-full" aria-hidden />
          {displayName}
        </Link>
      ) : (
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-white/85 border border-white/[0.12] px-3.5 py-1.5 hover:border-white/[0.28] hover:text-white transition-colors font-mono"
        >
          sign in
        </Link>
      )}
    </header>
  );
}

function HeadLink({
  href,
  children,
  active,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "text-[11px] tracking-[0.18em] uppercase px-2.5 py-1.5 border transition-colors font-mono " +
        (active
          ? "text-white border-white/[0.12]"
          : "text-white/55 border-transparent hover:text-white hover:border-white/[0.12]") +
        " " +
        className
      }
    >
      {children}
    </Link>
  );
}

function DefaultSubline() {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
  const { h, m } = computeDailyResetET();
  return (
    <>
      {date} · <span className="text-white">drill window open</span> · daily
      resets in {h}h {String(m).padStart(2, "0")}m
    </>
  );
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
