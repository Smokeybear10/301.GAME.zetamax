import Link from "next/link";
import { ZpButton } from "@/components/ui/zp-button";
import { TocRail } from "./toc-rail";

export const metadata = {
  title: "About — Zetamax",
};

const toc = [
  { id: "practice", label: "Practice" },
  { id: "competitive", label: "Competitive" },
  { id: "stats", label: "Stats" },
  { id: "learn", label: "How Learn works" },
  { id: "data", label: "Where data lives" },
  { id: "credit", label: "Credit" },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <ZpButton asChild variant="chip" className="absolute top-6 left-6 z-10">
        <Link href="/" aria-label="Back to home">← menu</Link>
      </ZpButton>

      <div className="max-w-[1160px] mx-auto px-6 sm:px-10 lg:px-16 py-20 lg:py-24 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,720px)] gap-10 lg:gap-20 items-start">

        <TocRail items={toc} />

        <article>
          {/* Doc head */}
          <header className="mb-12">
            <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3.5">
              About — Zetamax
            </p>
            <h1 className="font-extralight text-3xl sm:text-4xl md:text-5xl tracking-[-0.025em] leading-[1.05] max-w-[22ch] mb-[18px]">
              Mental-math drill, kept lean.
            </h1>
            <p className="text-white/75 text-base sm:text-[16.5px] leading-relaxed max-w-[60ch] font-light">
              Two minutes. Open the page, drill, see how you did.{" "}
              <span className="text-white">Zetamac-compatible by default</span>{" "}
              — same operand ranges, same auto-submit, same instant feel.
              Practice and Competitive share one engine; only what happens
              after the round differs.
            </p>
          </header>

          {/* Spec strip */}
          <section
            aria-label="Specification"
            className="my-10 border-y border-white/10"
          >
            <SpecRow k="Round length" v="2:00" note="120s, ± 2s tolerance" mono />
            <SpecRow k="Sign-in" v="optional" note="Practice = none · Competitive = Google" />
            <SpecRow k="Storage" v="your device" note={<span>localStorage<FnRef n={1} /></span>} />
            <SpecRow k="Cost" v="free" note="no paid tier" last />
          </section>

          {/* Sections */}
          <Section id="practice" title="Practice" abstract="Local-only mode. The drill, with nothing after.">
            <p>
              No sign-in, no backend. Your runs save to this device&apos;s{" "}
              <Tag>localStorage</Tag>. Stats are computed locally and live on
              the same device.
            </p>
          </Section>

          <Section
            id="competitive"
            title="Competitive"
            abstract="Same engine, three flavours of post-round wrap."
          >
            <p>Friend leaderboards on top of the same drill engine. Three flavours:</p>

            <dl className="mt-6 border-t border-white/[0.07]">
              <Flavour name="Ranked" badge="elo · margin-aware">
                every round counts. Server-issued seed, server-validated
                score, ELO updates per round with margin-aware math (a 47-30
                win is bigger than 47-46).
              </Flavour>
              <Flavour name="Daily" badge="30d mean">
                one shared puzzle per day, one shot, leaderboard ranks the
                30-day mean. Reload mid-round forfeits that day; you can
                backfill past days you missed.
              </Flavour>
              <Flavour name="Leagues" badge="share url" last>
                share a URL, friends join, rank against just them. Open by
                default — no approval queue, anyone with the link is in.
              </Flavour>
            </dl>
          </Section>

          <Section id="stats" title="Stats" abstract="Per-op accuracy, latency, trend, heatmap, focus.">
            <p>
              Per-operation accuracy and latency, score trend across the last
              thirty rounds, a multiplication-fact heatmap, and a weak-pattern
              diagnostic that names the one thing you should drill next.
              Export to JSON or wipe at any time — it&apos;s your data.
            </p>
          </Section>

          <Section
            id="learn"
            title="How Learn works"
            abstract="Skill tags + pattern tags · empirical-bayes diagnostic · single Today's focus output."
          >
            <p>
              Every problem you drill gets a{" "}
              <span className="text-white">skill tag</span>{" "}
              (<Tag>multi-carry addition</Tag>, <Tag>large multiplication</Tag>)
              and zero or more <span className="text-white">pattern tags</span>{" "}
              (<Tag>by-9</Tag>, <Tag>near-square</Tag>, <Tag>doubles</Tag>).
              Patterns trump skills — if a problem fits a known mental-math
              pattern, the pattern wins the attribution.<FnRef n={2} />
            </p>
            <p className="mt-5">
              After ~30 problems, the system starts looking for the tag
              that&apos;s consistently slow for <em>you</em>. Three
              guardrails keep it honest:
            </p>

            <div className="mt-4 border-t border-white/[0.07]">
              <Guard name="Log-transformed latencies">
                One eight-second blank can&apos;t dominate a tag&apos;s
                average — outliers stop being outliers in log space.
              </Guard>
              <Guard name="Empirical-Bayes shrinkage">
                Tags with few attempts get pulled toward your overall mean;
                tags with many attempts converge toward their raw average.
                No cliff at &ldquo;I just hit 10 samples.&rdquo;
              </Guard>
              <Guard name="Sample-size floors" last>
                30 problems total before the diagnostic wakes up; 10+
                attempts on a specific tag before that tag is eligible. A
                tag is only flagged when the system is ≥70% confident
                it&apos;s genuinely slow versus your own baseline.
              </Guard>
            </div>

            <p className="mt-6">
              The result is a single{" "}
              <span className="text-white">Today&apos;s focus</span> tag —
              the one weakness most worth drilling next. No top-3 dashboards;
              dashboards of deficits cause people to disengage. Just the next
              thing to work on.<FnRef n={3} />
            </p>
          </Section>

          <Section
            id="data"
            title="Where your data lives"
            abstract="Local stays local. Competitive scores go to the server."
          >
            <p>
              Practice scores, lifetime totals, the multiplication heatmap,
              and the weak-pattern diagnostic all live in your browser&apos;s{" "}
              <Tag>localStorage</Tag>. Nothing about <em>how you drill</em>{" "}
              leaves your device. Competitive scores are saved to a server
              (so friends can see them on the leaderboard), but the per-tag
              diagnosis stays local.
            </p>
            <p className="mt-5 font-mono text-[12.5px] text-white/55 leading-relaxed">
              Wipe everything from{" "}
              <span className="text-white">/me → Stats → Reset all stats</span>,
              or export a JSON copy first.
            </p>
          </Section>

          <Section id="credit" title="Credit">
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
              . Built to keep the keyboard feel intact while making the score
              stick.
            </p>
          </Section>

          {/* Footnotes */}
          <section
            id="notes"
            className="mt-[72px] pt-6 border-t border-white/10"
            aria-label="Notes"
          >
            <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3.5">
              Notes
            </p>
            <ol className="space-y-2">
              <Footnote n={1}>
                Web Storage API · domain-scoped, persists across reloads,
                browser-imposed ~5 MB cap.
              </Footnote>
              <Footnote n={2}>
                Attribution is versioned. When the tagging rules improve,
                prior rounds can be re-tagged without losing scores.
              </Footnote>
              <Footnote n={3}>
                Late-round rushing is filtered — events from the last 10
                seconds of a round don&apos;t count toward per-tag latency.
              </Footnote>
            </ol>
          </section>

          {/* Footer — existing pattern preserved (sequence numerals on nav cards are OK) */}
          <footer className="mt-14 sm:mt-16 pt-8 border-t border-white/10 flex items-end justify-between gap-8">
            <Link
              href="/practice"
              className="group inline-block py-2"
              aria-label="Go to practice"
            >
              <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">01</div>
              <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 transition-colors group-hover:border-white">
                Drill →
              </div>
            </Link>
            <Link
              href="/competitive"
              className="group inline-block py-2 text-right"
              aria-label="Go to competitive"
            >
              <div className="font-mono text-[11px] tracking-[0.1em] text-white/42 mb-1">02</div>
              <div className="font-extralight text-3xl tracking-[-0.02em] leading-none pb-1.5 border-b border-white/10 transition-colors group-hover:border-white">
                Compete →
              </div>
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  abstract,
  children,
}: {
  id: string;
  title: string;
  abstract?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="pt-14 mt-2 border-t border-white/10">
      <h2 className="font-light text-[22px] tracking-[-0.012em] text-white">
        {title}
      </h2>
      {abstract && (
        <p className="mt-3.5 mb-6 pl-3.5 border-l border-white/10 font-mono text-[12.5px] leading-[1.7] text-white/55 max-w-[56ch]">
          {abstract}
        </p>
      )}
      <div className="text-white/75 font-light leading-[1.66] text-base max-w-[60ch]">
        {children}
      </div>
    </section>
  );
}

function SpecRow({
  k,
  v,
  note,
  mono,
  last,
}: {
  k: string;
  v: string;
  note: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-[140px_1fr_auto] sm:grid-cols-[200px_1fr_auto] items-baseline gap-5 py-3.5 " +
        (last ? "" : "border-b border-white/[0.07]")
      }
    >
      <span className="font-mono text-[10.5px] tracking-[0.24em] uppercase text-white/55">
        {k}
      </span>
      <span
        className={
          "text-white font-light tracking-[-0.005em] " +
          (mono ? "font-mono text-[14px]" : "text-base")
        }
      >
        {v}
      </span>
      <span className="font-mono text-[10.5px] text-white/42 text-right">
        {note}
      </span>
    </div>
  );
}

function Flavour({
  name,
  badge,
  children,
  last,
}: {
  name: string;
  badge: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        "grid sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 py-[18px] " +
        (last ? "" : "border-b border-white/[0.07]")
      }
    >
      <dt>
        <span className="text-white font-normal text-[15px] tracking-[-0.005em] block">
          {name}
        </span>
        <span className="block font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-1">
          {badge}
        </span>
      </dt>
      <dd className="text-white/75 font-light text-[15.5px] leading-[1.65]">
        {children}
      </dd>
    </div>
  );
}

function Guard({
  name,
  children,
  last,
}: {
  name: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={"py-4 " + (last ? "" : "border-b border-white/[0.07]")}>
      <div className="text-white font-normal text-[15px] tracking-[-0.005em] mb-1">
        {name}
      </div>
      <div className="text-white/75 font-light text-[15px] leading-[1.65]">
        {children}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[12.5px] text-white/85 px-1.5 py-px bg-white/[0.05] border border-white/10 rounded-[2px]">
      {children}
    </span>
  );
}

function FnRef({ n }: { n: number }) {
  return (
    <sup className="font-mono text-[10px] text-white">
      <a
        href={`#fn-${n}`}
        className="border-b border-white/28 pl-[2px] pr-[2px]"
        aria-label={`Footnote ${n}`}
      >
        {n}
      </a>
    </sup>
  );
}

function Footnote({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li
      id={`fn-${n}`}
      className="grid grid-cols-[28px_1fr] gap-3 font-mono text-[12.5px] leading-[1.66] text-white/55"
    >
      <span className="text-white">[{n}]</span>
      <span>{children}</span>
    </li>
  );
}
