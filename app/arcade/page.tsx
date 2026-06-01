import { SiteHead } from "@/app/_components/site-head";
import { TransitionLink } from "@/app/_components/transition-link";
import { FIRM_SIMS } from "@/lib/drill";

export const metadata = {
  title: "ZETAMAX | Arcade",
  description:
    "Firm-test simulators and alternate game modes — practice the real Optiver, SIG, IMC, and Jane Street interview math formats.",
};

export default function ArcadePage() {
  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white antialiased">
      <div className="max-w-[1180px] mx-auto px-5 pt-5">
        <SiteHead />

        <div className="px-1 sm:px-5 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3.5">
            Arcade
          </p>
          <h1 className="font-extralight text-3xl sm:text-4xl md:text-5xl tracking-[-0.025em] leading-[1.05] max-w-[20ch] mb-4">
            Drill the <span className="text-white/45">actual test.</span>
          </h1>
          <p className="text-white/65 text-base sm:text-[16.5px] leading-relaxed max-w-[58ch] font-light mb-16">
            Trading firms screen with timed mental-math tests that look nothing
            like generic Zetamac. These run the real formats — same counts,
            same clocks, same scoring — so you know where you stand before the
            interview.
          </p>

          {/* Firm sims */}
          <div className="flex items-baseline justify-between mb-5 pb-2 border-b border-white/[0.08]">
            <h2 className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/65">
              Firm sims
            </h2>
            <span className="font-mono text-[10px] tracking-[0.24em] uppercase text-white/30">
              no sign-in
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
            {FIRM_SIMS.map((sim) => (
              <TransitionLink
                key={sim.id}
                href={`/arcade/sim/${sim.id}`}
                className="group bg-[#111] border border-white/[0.12] hover:border-white/[0.28] hover:bg-[#16161a] transition-colors p-[22px] flex flex-col justify-between min-h-[150px]"
              >
                <div className="flex justify-between items-baseline text-[10px] tracking-[0.24em] uppercase text-white/42 font-mono mb-3">
                  <span className="text-white/65">{sim.firm}</span>
                  <span className="group-hover:text-white transition-colors">
                    start →
                  </span>
                </div>
                <div>
                  <div className="font-sans font-extralight text-[28px] tracking-[-0.025em] leading-none text-white mb-2">
                    {sim.name}
                  </div>
                  <div className="text-[11.5px] text-white/55 font-mono">
                    {sim.format}
                  </div>
                </div>
              </TransitionLink>
            ))}
          </div>

          {/* Other modes */}
          <div className="flex items-baseline justify-between mb-5 pb-2 border-b border-white/[0.08]">
            <h2 className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/65">
              Versus
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              aria-disabled="true"
              className="bg-[#0a0a0a] border border-white/[0.06] p-[22px] flex flex-col justify-between min-h-[150px] cursor-not-allowed"
            >
              <div className="flex justify-end text-[10px] tracking-[0.24em] uppercase text-white/30 font-mono mb-3">
                <span>locked</span>
              </div>
              <div>
                <div className="font-sans font-extralight text-[28px] tracking-[-0.025em] leading-none text-white/30 mb-2">
                  Race
                </div>
                <div className="text-[11.5px] text-white/30 font-mono">
                  race a friend&apos;s ghost — sign in, coming soon
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
