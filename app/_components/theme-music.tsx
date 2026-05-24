"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  activeStemsForPlay,
  LayeredMixer,
  LOBBY_STEMS,
  preloadStems,
  type Stem,
} from "@/lib/audio/layered-mixer";

const STORAGE_KEY = "zetamax:music-on";

const DRILL_ROUTE_RE = /^\/(practice\/(classic|learn)|competitive\/(ranked|daily|race))/;

function isDrillRoute(pathname: string): boolean {
  return DRILL_ROUTE_RE.test(pathname);
}

function computeStems(
  pathname: string,
  isRunning: boolean,
  peakStreak: number,
  score: number,
): readonly Stem[] {
  if (isDrillRoute(pathname) && isRunning) {
    return activeStemsForPlay(peakStreak, score);
  }
  return LOBBY_STEMS;
}

type StreakDetail = { streak: number; score: number; active: boolean };

/**
 * Persistent music toggle. One AudioContext, all 7 stems run phase-locked.
 * Stem mix depends on route + drill state:
 *
 *   - Lobby / drill-idle / drill-ended  → LOBBY_STEMS (synth + guitar)
 *   - Drill running                     → activeStemsForPlay(peak, score)
 *
 * Peak streak and cumulative score ratchet up only — once a tier is
 * earned, that stem stays in for the round. Round end (active flips
 * false) or leaving the drill route resets both metrics and falls back
 * to LOBBY_STEMS.
 *
 * Route changes are handled by crossfade (mixer.setActive) only — never
 * a restart. Sources keep playing in phase, gains ramp.
 *
 * Default off — browsers block autoplay without a user gesture.
 */
export function ThemeMusic() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const mixerRef = useRef<LayeredMixer | null>(null);

  // Live state used by the streak handler + crossfade effects. Refs (not
  // useState) because we don't want re-renders on every streak tick; we
  // just need to read the latest values when an event fires.
  const peakStreakRef = useRef(0);
  const scoreRef = useRef(0);
  const isRunningRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Hydrate persisted on/off from localStorage.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setOn(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Warm the jsDelivr cache on mount so the first ♪-on click doesn't pay
  // ~56 MB of cross-origin transfers before any audio plays.
  useEffect(() => {
    preloadStems();
  }, []);

  // React to on/off toggle. Does NOT depend on pathname/streak — those are
  // handled by dedicated effects below that crossfade without restarting.
  useEffect(() => {
    if (!hydrated) return;
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (on) {
      const initial = computeStems(
        pathnameRef.current,
        isRunningRef.current,
        peakStreakRef.current,
        scoreRef.current,
      );
      mixer.start(initial).catch(() => setOn(false));
    } else {
      mixer.stop();
    }
  }, [on, hydrated]);

  // Route change → crossfade. Leaving a drill route resets the ratchet so
  // returning to a drill starts from synth-only again.
  useEffect(() => {
    if (!hydrated || !on) return;
    if (!isDrillRoute(pathname)) {
      peakStreakRef.current = 0;
      scoreRef.current = 0;
      isRunningRef.current = false;
    }
    const mixer = mixerRef.current;
    if (!mixer || !mixer.isPlaying()) return;
    mixer.setActive(
      computeStems(
        pathname,
        isRunningRef.current,
        peakStreakRef.current,
        scoreRef.current,
      ),
    );
  }, [pathname, on, hydrated]);

  // Streak broadcasts from drill screens drive the ratchet.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StreakDetail>).detail;
      if (!detail) return;
      if (!detail.active) {
        peakStreakRef.current = 0;
        scoreRef.current = 0;
      } else {
        peakStreakRef.current = Math.max(
          peakStreakRef.current,
          detail.streak,
        );
        scoreRef.current = Math.max(scoreRef.current, detail.score);
      }
      isRunningRef.current = detail.active;
      const mixer = mixerRef.current;
      if (!mixer || !mixer.isPlaying()) return;
      mixer.setActive(
        computeStems(
          pathnameRef.current,
          isRunningRef.current,
          peakStreakRef.current,
          scoreRef.current,
        ),
      );
    };
    window.addEventListener("zetamax:streak", handler);
    return () => window.removeEventListener("zetamax:streak", handler);
  }, []);

  // Resume the AudioContext when the tab regains focus — Safari especially
  // suspends on tab-switch and won't auto-recover otherwise.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const mixer = mixerRef.current;
      if (!mixer || !on) return;
      mixer.ensureUserGestureContext();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [on]);

  // Permanent teardown on unmount.
  useEffect(() => {
    return () => {
      void mixerRef.current?.destroy();
      mixerRef.current = null;
    };
  }, []);

  const toggle = () => {
    // CRITICAL: create + resume the AudioContext SYNCHRONOUSLY here, in the
    // user-gesture context. Doing it later (inside the on/off useEffect)
    // means the gesture has already expired by the time `new AudioContext()`
    // runs, and Chrome/Safari leave the context suspended forever.
    if (!mixerRef.current) {
      mixerRef.current = new LayeredMixer();
    }
    mixerRef.current.ensureUserGestureContext();

    setOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (!hydrated) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute theme music" : "Play theme music"}
      className="fixed bottom-4 right-4 z-50 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase border border-white/15 text-white/65 hover:text-white hover:border-white/40 bg-black/40 backdrop-blur-sm transition-colors"
    >
      {on ? "♪ on" : "♪ off"}
    </button>
  );
}
