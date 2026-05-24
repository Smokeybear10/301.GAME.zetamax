"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

type StreakDetail = { streak: number; score: number; active: boolean };

/**
 * Persistent layered-music toggle. One AudioContext for the whole session,
 * all 7 stems running phase-locked. Stem mix shifts based on route:
 *
 *   - lobby/menu routes → LOBBY_STEMS (synth + guitar + backing-vocals)
 *   - drill routes      → tier ladder driven by the current streak
 *
 * Drill screens dispatch `zetamax:streak` CustomEvents with the live
 * streak count; this component listens and crossfades the stems in/out.
 * Default off — browsers block autoplay without a user gesture.
 */
export function ThemeMusic() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const mixerRef = useRef<LayeredMixer | null>(null);
  // Audio ratchets up only, never down. Track the round's peak streak AND
  // current score; the mixer activates tiers based on whichever metric is
  // further along. Both reset when active flips false (round end / leave).
  //
  // The visible streak counter still uses the live (decaying) streak — only
  // the audio is sticky.
  const peakStreakRef = useRef(0);
  const scoreRef = useRef(0);
  const drillActiveRef = useRef(false);
  const pathnameRef = useRef(pathname);

  pathnameRef.current = pathname;

  // Recompute the active stem set based on current route + peak streak + score.
  const applyStems = useCallback(() => {
    const mixer = mixerRef.current;
    if (!mixer || !mixer.isPlaying()) return;
    const path = pathnameRef.current;
    let stems: readonly Stem[];
    if (isDrillRoute(path) && drillActiveRef.current) {
      stems = activeStemsForPlay(peakStreakRef.current, scoreRef.current);
    } else {
      stems = LOBBY_STEMS;
    }
    mixer.setActive(stems);
  }, []);

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
  // ~56 MB of cross-origin transfers before any audio plays. Best-effort —
  // failure here just means the user falls back to the slow path.
  useEffect(() => {
    preloadStems();
  }, []);

  // Listen for streak broadcasts from drill screens.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StreakDetail>).detail;
      if (!detail) return;
      if (!detail.active) {
        // Round ended (or component unmounted). Reset the ratchet.
        peakStreakRef.current = 0;
        scoreRef.current = 0;
      } else {
        // Ratchet up. PeakStreak never goes down within a round; score is
        // monotonic in Zetamac too, but max() is cheap insurance.
        peakStreakRef.current = Math.max(
          peakStreakRef.current,
          detail.streak,
        );
        scoreRef.current = Math.max(scoreRef.current, detail.score);
      }
      drillActiveRef.current = detail.active;
      applyStems();
    };
    window.addEventListener("zetamax:streak", handler);
    return () => window.removeEventListener("zetamax:streak", handler);
  }, [applyStems]);

  // React to route changes — leaving a drill resets the ratchet so the
  // lobby mix takes over immediately.
  useEffect(() => {
    if (!isDrillRoute(pathname)) {
      drillActiveRef.current = false;
      peakStreakRef.current = 0;
      scoreRef.current = 0;
    }
    applyStems();
  }, [pathname, applyStems]);

  // React to on/off toggle.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      if (on) {
        if (!mixerRef.current) {
          mixerRef.current = new LayeredMixer();
        }
        const initial = isDrillRoute(pathname)
          ? activeStemsForPlay(peakStreakRef.current, scoreRef.current)
          : LOBBY_STEMS;
        try {
          await mixerRef.current.start(initial);
          if (cancelled) {
            mixerRef.current.stop();
          }
        } catch {
          // Autoplay blocked or load failure — flip the toggle back off.
          if (!cancelled) setOn(false);
        }
      } else {
        mixerRef.current?.stop();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [on, hydrated, pathname]);

  // Permanent teardown on unmount.
  useEffect(() => {
    return () => {
      void mixerRef.current?.destroy();
      mixerRef.current = null;
    };
  }, []);

  const toggle = () => {
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
