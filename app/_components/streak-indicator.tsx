"use client";

type Props = {
  streak: number;
  active: boolean;
};

/**
 * Small "× N" badge for the drill header. Slot always rendered so layout
 * doesn't reflow when the streak appears; opacity fades in once the streak
 * crosses 2 (below that, "× 1" or "× 0" is noise, not signal).
 */
export function StreakIndicator({ streak, active }: Props) {
  const visible = active && streak >= 2;
  return (
    <span
      aria-label={visible ? `Streak: ${streak} in a row` : undefined}
      aria-live="polite"
      className={`font-mono text-sm tabular-nums tracking-[-0.01em] transition-opacity duration-200 ${
        visible ? "text-white opacity-100" : "opacity-0"
      }`}
    >
      × {visible ? streak : 0}
    </span>
  );
}
