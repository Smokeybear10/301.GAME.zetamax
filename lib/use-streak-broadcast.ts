"use client";

import { useEffect } from "react";

/**
 * Fires a `zetamax:streak` window CustomEvent whenever the streak or its
 * active flag changes. The layered audio mixer (in `ThemeMusic`) listens
 * for this event and crossfades stems in/out accordingly.
 *
 * Decoupling the drill screen from the audio component this way means a
 * drill route never has to know whether music is on, and the mixer doesn't
 * need to traverse the React tree to find the current drill state.
 *
 * Also fires one final {streak: 0, active: false} on unmount so the mixer
 * drops back to lobby stems as soon as the drill component goes away.
 */
export function useStreakBroadcast(streak: number, active: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("zetamax:streak", {
        detail: { streak, active },
      }),
    );
  }, [streak, active]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("zetamax:streak", {
          detail: { streak: 0, active: false },
        }),
      );
    };
  }, []);
}
