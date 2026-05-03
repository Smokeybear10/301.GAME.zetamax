import Link from "next/link";

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
        A timed mental-arithmetic drill. Two minutes. Open the page.
      </p>

      {/* picker */}
      <div className="flex gap-12 md:gap-16 items-stretch">
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

        <div className="w-px bg-white/10 self-stretch" aria-hidden="true" />

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
      </div>

      {/* footer mark */}
      <p className="absolute bottom-6 font-mono text-[10px] tracking-[0.32em] text-white/42 uppercase">
        v1 · still cooking
      </p>
    </main>
  );
}
