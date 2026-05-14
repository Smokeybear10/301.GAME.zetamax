"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCountUp({
  from,
  to,
  durationMs = 1200,
  delayMs = 0,
  className = "",
}: {
  from: number;
  to: number;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}) {
  const [value, setValue] = useState(from);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  fromRef.current = from;
  toRef.current = to;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(to);
      return;
    }

    let frame = 0;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(fromRef.current + (toRef.current - fromRef.current) * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [from, to, durationMs, delayMs]);

  return <span className={`tabular-nums ${className}`}>{value}</span>;
}
