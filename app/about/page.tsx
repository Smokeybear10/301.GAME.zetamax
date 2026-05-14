import Link from "next/link";
import { ZpButton } from "@/components/ui/zp-button";

export const metadata = {
  title: "About — Zetamax",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <ZpButton asChild variant="chip" className="absolute top-6 left-6">
        <Link href="/" aria-label="Back to home">← menu</Link>
      </ZpButton>

      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
        <header className="mb-12 sm:mb-16">
          <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
            About
          </p>
          <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-tight">
            Mental-math drill, kept lean.
          </h1>
        </header>

        <div className="space-y-12 sm:space-y-14">
          <p className="text-white/75 leading-relaxed">
            Two minutes. Open the page, drill, see how you did. Zetamac-compatible by
            default — same operand ranges, same auto-submit, same instant feel. Practice
            and Competitive share one engine; only what happens after the round differs.
          </p>

          <Section label="Practice">
            <p>
              Local only. No sign-in, no backend. Your runs save to this device&apos;s
              localStorage. Stats are computed locally and live on the same device.
            </p>
          </Section>

          <Section label="Competitive">
            <p>
              Friend leaderboards on top of the same drill engine. Three flavours:
            </p>
            <ul className="mt-3 space-y-2 list-none">
              <li>
                <span className="text-white">Ranked</span> — every round counts.
                Server-issued seed, server-validated score, ELO updates per round
                with margin-aware math (a 47-30 win is bigger than 47-46).
              </li>
              <li>
                <span className="text-white">Daily</span> — one shared puzzle per
                day, one shot, leaderboard ranks the 30-day mean. Reload mid-round
                forfeits that day; you can backfill past days you missed.
              </li>
              <li>
                <span className="text-white">Leagues</span> — share a URL, friends
                join, rank against just them. Open by default — no approval queue,
                anyone with the link is in.
              </li>
            </ul>
          </Section>

          <Section label="Stats">
            <p>
              Per-operation accuracy and latency, score trend across the last thirty
              rounds, a multiplication-fact heatmap, and a weak-pattern diagnostic
              that names the one thing you should drill next. Export to JSON or wipe
              at any time — it&apos;s your data.
            </p>
          </Section>

          <Section label="How Learn works">
            <p>
              Every problem you drill gets a <span className="text-white">skill tag</span>
              {" "}(<span className="font-mono text-[13px]">multi-carry addition</span>,
              {" "}<span className="font-mono text-[13px]">large multiplication</span>)
              and zero or more <span className="text-white">pattern tags</span>
              {" "}(<span className="font-mono text-[13px]">by-9</span>,
              {" "}<span className="font-mono text-[13px]">near-square</span>,
              {" "}<span className="font-mono text-[13px]">doubles</span>). Patterns
              trump skills — if a problem fits a known mental-math pattern, the pattern
              wins the attribution.
            </p>
            <p className="mt-4">
              After ~30 problems, the system starts looking for the tag that&apos;s
              consistently slow for <em>you</em>. Three guardrails keep it honest:
            </p>
            <ul className="mt-3 space-y-2 list-none">
              <li>
                <span className="text-white">Log-transformed latencies.</span> One
                eight-second blank can&apos;t dominate a tag&apos;s average — outliers
                stop being outliers in log space.
              </li>
              <li>
                <span className="text-white">Empirical-Bayes shrinkage.</span> Tags with
                few attempts get pulled toward your overall mean; tags with many
                attempts converge toward their raw average. No cliff at &ldquo;I just
                hit 10 samples.&rdquo;
              </li>
              <li>
                <span className="text-white">Sample-size floors.</span> 30 problems
                total before the diagnostic wakes up; 10+ attempts on a specific tag
                before that tag is eligible. A tag is only flagged when the system is
                ≥70% confident it&apos;s genuinely slow versus your own baseline.
              </li>
            </ul>
            <p className="mt-4">
              The result is a single <span className="text-white">Today&apos;s focus</span>
              {" "}tag — the one weakness most worth drilling next. No top-3 dashboards;
              dashboards of deficits cause people to disengage. Just the next thing
              to work on.
            </p>
            <p className="mt-4 font-mono text-[13px] text-white/65">
              Late-round rushing is filtered out — events from the last 10 seconds of
              a round don&apos;t count toward per-tag latency. Tag attribution is
              versioned, so when the rules improve, old rounds can be re-tagged.
            </p>
          </Section>

          <Section label="Where your data lives">
            <p>
              Practice scores, lifetime totals, the multiplication heatmap, and the
              weak-pattern diagnostic all live in your browser&apos;s localStorage.
              Nothing about <em>how you drill</em> leaves your device. Competitive
              scores are saved to a server (so friends can see them on the
              leaderboard), but the per-tag diagnosis stays local.
            </p>
            <p className="mt-4 font-mono text-[13px] text-white/65">
              You can wipe everything from <span className="text-white">/me → Stats →
              Reset all stats</span>, or export a JSON copy first.
            </p>
          </Section>

          <Section label="Credit">
            <p>
              Inspired by{" "}
              <a
                href="https://arithmetic.zetamac.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/85 underline underline-offset-4 decoration-white/20 hover:decoration-white transition-colors"
              >
                Zetamac
              </a>
              . Built to keep the keyboard feel intact while making the score stick.
            </p>
          </Section>
        </div>

        <footer className="mt-16 sm:mt-20 pt-8 border-t border-white/10 flex items-center justify-between">
          <Link
            href="/practice"
            className="font-extralight text-lg tracking-[-0.01em] pb-1 border-b border-white/10 hover:border-white transition-colors"
          >
            Drill →
          </Link>
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/30">
            v1
          </p>
        </footer>
      </div>
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3">
        {label}
      </h2>
      <div className="text-white/75 leading-relaxed">{children}</div>
    </section>
  );
}
