import Link from "next/link";

export const metadata = {
  title: "About — Zetamax",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <Link
        href="/"
        aria-label="Back to home"
        className="absolute top-6 left-6 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
      >
        ← menu
      </Link>

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

          <Section label="Competitive · soon">
            <p>
              Friend leaderboards on top of the same drill engine. Ranked rounds get a
              server-issued seed and a sanity pass before they post — so a friend
              clicking your link sees the same problem stream you saw.
            </p>
          </Section>

          <Section label="Stats">
            <p>
              Per-operation accuracy and latency, score trend across the last thirty
              rounds, and a multiplication-fact heatmap so you can see exactly which
              cells you&apos;re slow on. Export to JSON or wipe at any time — it&apos;s
              your data.
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
