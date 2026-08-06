"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type FirmSim, type RoundResult } from "@/lib/drill";
import { ZpButton } from "@/components/ui/zp-button";
import { AnimatedScore } from "@/app/_components/animated-score";

type Verdict = "pass" | "competitive" | "below";

function verdictFor(sim: FirmSim, score: number): Verdict {
  if (score >= sim.competitive) return "competitive";
  if (score >= sim.pass) return "pass";
  return "below";
}

export function SimResults({
  sim,
  result,
  onPlayAgain,
}: {
  sim: FirmSim;
  result: RoundResult;
  onPlayAgain: () => void;
}) {
  const [shown, setShown] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(result.score));
    return () => cancelAnimationFrame(id);
  }, [result.score]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayAgain]);

  const verdict = verdictFor(sim, result.score);
  const headline =
    verdict === "competitive"
      ? `Competitive at ${sim.firm}.`
      : verdict === "pass"
        ? `You'd pass ${sim.firm}.`
        : `Below ${sim.firm}'s bar.`;
  const detail =
    verdict === "below"
      ? `${sim.pass} to pass · ${sim.competitive} competitive`
      : verdict === "pass"
        ? `cleared the ~${sim.pass} pass mark · ${sim.competitive} is competitive`
        : `past the ~${sim.competitive} competitive mark — strong`;

  const onShare = async () => {
    const text = `I scored ${result.score} on the ${sim.name} mental-math sim (${headline}) — zeta-max.vercel.app/arcade`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Zetamax", text });
        return;
      }
    } catch {
      /* dismissed */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* blocked */
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6 z-10 antialiased overflow-y-auto py-12">
      <p className="font-mono text-[11px] tracking-[0.32em] text-white/42 uppercase mb-10 zp-fade zp-fade-1">
        {sim.name} · complete
      </p>

      <div className="font-black tracking-[-0.06em] leading-[0.85] text-[clamp(120px,24vw,340px)] zp-fade zp-fade-2">
        <AnimatedScore value={shown} slots={String(result.score).length || 1} />
      </div>

      <div
        className={`mt-6 mb-10 h-px w-32 ${
          verdict === "below" ? "bg-white/20" : "bg-white/60"
        } motion-safe:origin-center motion-safe:animate-[zp-pb-rule_500ms_ease-out_600ms_both]`}
        aria-hidden="true"
      />

      <p className="font-light text-xl md:text-2xl tracking-[-0.01em] mb-2 zp-fade zp-fade-3">
        {verdict !== "below" && <span aria-hidden="true">✓ </span>}
        {headline}
      </p>
      <p className="font-mono text-[12px] tracking-[0.04em] text-white/42 zp-fade zp-fade-3">
        {detail}
      </p>
      <p className="font-mono text-[11px] tracking-[0.04em] text-white/35 mt-2 zp-fade zp-fade-3">
        {result.score} correct of {result.problemsAttempted} ·{" "}
        {Math.round(result.accuracy * 100)}% clean ·{" "}
        {Math.round(result.meanLatencyMs)}ms mean
      </p>

      <div className="flex gap-3 pt-12 zp-fade zp-fade-4">
        <ZpButton variant="primary" onClick={onPlayAgain}>
          Run again
        </ZpButton>
        <ZpButton variant="secondary" onClick={onShare}>
          {copied ? "Copied ✓" : "Share"}
        </ZpButton>
        <ZpButton asChild variant="secondary">
          <Link href="/arcade">Arcade</Link>
        </ZpButton>
      </div>

      <p className="font-mono text-[10px] tracking-[0.18em] text-white/30 mt-8 zp-fade zp-fade-5">
        or press Enter
      </p>

      <style jsx>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes zp-pb-rule {
            from {
              transform: scaleX(0);
              opacity: 0;
            }
            to {
              transform: scaleX(1);
              opacity: 1;
            }
          }
        }
      `}</style>
    </div>
  );
}
