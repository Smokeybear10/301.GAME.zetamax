import Link from "next/link";

export const metadata = {
  title: "Competitive — Zetamax",
};

type Mode = {
  num: string;
  slug: string;
  title: string;
  subtitle: string;
  href: string | null; // null = not yet implemented
};

const MODES: Mode[] = [
  {
    num: "01",
    slug: "ranked",
    title: "Ranked",
    subtitle: "server-validated rounds that count",
    href: "/competitive/ranked",
  },
  {
    num: "02",
    slug: "daily",
    title: "Daily",
    subtitle: "soon — same seed, every friend, daily",
    href: null,
  },
  {
    num: "03",
    slug: "race",
    title: "Race",
    subtitle: "soon — live 1v1, same problem stream",
    href: null,
  },
  {
    num: "04",
    slug: "leaderboard",
    title: "Leaderboard",
    subtitle: "soon — your stats vs friends, every metric",
    href: null,
  },
];

export default function CompetitiveMenu() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-16 select-none antialiased">
      <Link
        href="/"
        aria-label="Back to home"
        className="absolute top-6 left-6 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
      >
        ← menu
      </Link>

      <div className="text-center mb-12 sm:mb-14">
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
          Competitive
        </p>
        <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-none">
          pick a mode
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 sm:gap-x-16 md:gap-x-24 gap-y-8 sm:gap-y-12 w-full max-w-xl">
        {MODES.map((m) =>
          m.href ? (
            <Link
              key={m.slug}
              href={m.href}
              className="group block py-2 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100"
            >
              <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">
                {m.num}
              </div>
              <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 mb-2 transition-colors group-hover:border-white">
                {m.title}
              </div>
              <div className="text-xs text-white/42">{m.subtitle}</div>
            </Link>
          ) : (
            <div
              key={m.slug}
              role="link"
              aria-disabled="true"
              tabIndex={-1}
              title="Coming soon"
              className="block py-2 cursor-not-allowed opacity-30 select-none"
            >
              <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">
                {m.num}
              </div>
              <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 mb-2">
                {m.title}
              </div>
              <div className="text-xs text-white/42">{m.subtitle}</div>
            </div>
          ),
        )}
      </div>

      <p className="absolute bottom-6 font-mono text-[10px] tracking-[0.32em] text-white/30 uppercase">
        sign-in required when modes ship
      </p>
    </main>
  );
}
