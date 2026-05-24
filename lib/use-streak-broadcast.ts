"use client";

import { useEffect } from "react";

/**
 * Fires a `zetamax:streak` window CustomEvent whenever the streak, score,
 * or active flag changes. The layered audio mixer (in `ThemeMusic`) listens
 * for this event and crossfades stems in/out accordingly.
 *
 * Both `streak` and `score` are sent because the mixer's tier triggers fire
 * on whichever crosses the threshold first — bursty players hit tiers via
 * streak, steady players via cumulative score.
 *
 * Also fires one final {streak: 0, score: 0, active: false} on unmount so
 * the mixer drops back to lobby stems as soon as the drill component goes
 * away (round end, navigation, etc).
 */
export function useStreakBroadcast(
  streak: number,
  score: number,
  active: boolean,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("zetamax:streak", {
        detail: { streak, score, active },
      }),
    );
  }, [streak, score, active]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("zetamax:streak", {
          detail: { streak: 0, score: 0, active: false },
        }),
      );
    };
  }, []);
}
