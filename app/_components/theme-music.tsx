"use client";

import { useEffect, useRef, useState } from "react";
import { LayeredMixer, preloadStems } from "@/lib/audio/layered-mixer";

const STORAGE_KEY = "zetamax:music-on";

/**
 * Persistent music toggle. One AudioContext for the whole session, all 7
 * stems run phase-locked. Only two states: on (every stem audible) or off
 * (silence). No route-based mixing, no streak-based layering.
 *
 * Default off — browsers block autoplay without a user gesture.
 */
export function ThemeMusic() {
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const mixerRef = useRef<LayeredMixer | null>(null);

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

  // React to on/off toggle.
  useEffect(() => {
    if (!hydrated) return;
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (on) {
      mixer.start().catch(() => {
        // Autoplay blocked or load failure — flip the toggle back off.
        setOn(false);
      });
    } else {
      mixer.stop();
    }
  }, [on, hydrated]);

  // Permanent teardown on unmount.
  useEffect(() => {
    return () => {
      void mixerRef.current?.destroy();
      mixerRef.current = null;
    };
  }, []);

  const toggle = () => {
    // CRITICAL: create + resume the AudioContext SYNCHRONOUSLY here, in the
    // user-gesture context. Doing it later (inside the on/off useEffect
    // chain) means the gesture has already expired by the time
    // `new AudioContext()` runs, and Chrome/Safari leave the context
    // suspended forever — toggle shows "on" but no audio ever plays.
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
