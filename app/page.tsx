import Link from "next/link";
import { ZpButton } from "@/components/ui/zp-button";

export const metadata = {
  title: "zetamax — timed mental math drill",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 select-none antialiased">
      {/* wordmark */}
      <div className="text-center mb-3">
        <h1 className="font-sans tracking-[-0.04em] leading-none text-[clamp(40px,6vw,88px)]">
          <span className="font-extralight">zeta</span>
          <span className="font-black">max</span>
        </h1>
      </div>

      {/* deck */}
      <p className="text-white/65 font-light text-center max-w-[32ch] leading-relaxed mb-20">
        A timed mental-arithmetic drill.
      </p>

      {/* picker */}
      <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 md:gap-16 items-center sm:items-stretch">
        <Link
          href="/practice"
          className="group block py-2 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100"
        >
          <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">01</div>
          <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 mb-2 transition-colors group-hover:border-white">
            Practice
          </div>
          <div className="text-xs text-white/42">no sign-in</div>
        </Link>

        <div className="hidden sm:block w-px bg-white/10 self-stretch" aria-hidden="true" />

        <Link
          href="/competitive"
          className="group block py-2 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100"
        >
          <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">02</div>
          <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 mb-2 transition-colors group-hover:border-white">
            Competitive
          </div>
          <div className="text-xs text-white/42">with friends</div>
        </Link>

        <div className="hidden sm:block w-px bg-white/10 self-stretch" aria-hidden="true" />

        <Link
          href="/me"
          className="group block py-2 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100"
        >
          <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">03</div>
          <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 mb-2 transition-colors group-hover:border-white">
            Profile
          </div>
          <div className="text-xs text-white/42">elo + stats</div>
        </Link>
      </div>

      {/* about — pinned to the bottom, lights up on hover */}
      <ZpButton asChild variant="chip" className="absolute bottom-6 px-7 tracking-[0.28em]">
        <Link href="/about">about</Link>
      </ZpButton>
    </main>
  );
}
