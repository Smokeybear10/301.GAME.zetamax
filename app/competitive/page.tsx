import Link from "next/link";

export const metadata = {
  title: "Competitive — zetamax",
};

export default function CompetitivePage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 antialiased">
      <div className="text-center max-w-md">
        <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-12">
          Competitive
        </p>
        <h1 className="font-extralight text-5xl tracking-[-0.03em] leading-none mb-8">
          Coming soon.
        </h1>
        <p className="text-white/65 leading-relaxed mb-12">
          Friend leaderboards, ranked rounds, and the invite flow are shipping
          in the next phase. The schema and API routes are already in place.
        </p>
        <div className="flex gap-12 justify-center items-center">
          <Link
            href="/practice"
            className="font-extralight text-lg tracking-[-0.01em] pb-1 border-b border-white/10 transition-colors hover:border-white"
          >
            Drill in Practice →
          </Link>
          <div className="w-px h-6 bg-white/10" aria-hidden="true" />
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[0.18em] text-white/42 uppercase hover:text-white transition-colors"
          >
            ← menu
          </Link>
        </div>
      </div>
    </main>
  );
}
