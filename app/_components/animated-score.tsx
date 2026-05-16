"use client";

const DIGITS = "0123456789".split("");

export function AnimatedScore({
  value,
  slots = 3,
  className = "",
}: {
  value: number;
  slots?: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.floor(value));
  const str = String(safe);
  const padCount = Math.max(0, slots - str.length);
  const chars = ("0".repeat(padCount) + str).slice(-Math.max(slots, str.length));

  return (
    <span
      className={`inline-flex tabular-nums leading-[1em] ${className}`}
      aria-label={String(safe)}
    >
      {chars.split("").map((d, i) => (
        <AnimatedDigit
          key={i}
          digit={Number(d)}
          visible={i >= chars.length - str.length}
        />
      ))}
    </span>
  );
}

function AnimatedDigit({ digit, visible }: { digit: number; visible: boolean }) {
  return (
    <span
      aria-hidden={!visible || undefined}
      className="relative inline-block overflow-hidden h-[1em] motion-safe:transition-[width,opacity] motion-safe:duration-[120ms] motion-safe:ease-out"
      style={{
        width: visible ? "1ch" : "0ch",
        opacity: visible ? 1 : 0,
      }}
    >
      <span
        className="absolute inset-0 flex flex-col will-change-transform motion-safe:transition-transform motion-safe:duration-[140ms] motion-safe:ease-out"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] leading-[1em] text-center">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
