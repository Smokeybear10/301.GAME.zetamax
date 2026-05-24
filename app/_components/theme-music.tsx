"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DRILL_STEMS,
  LayeredMixer,
  LOBBY_STEMS,
  preloadStems,
} from "@/lib/audio/layered-mixer";

const STORAGE_KEY = "zetamax:music-on";

const DRILL_ROUTE_RE = /^\/(practice\/(classic|learn)|competitive\/(ranked|daily|race))/;

function stemsForRoute(pathname: string) {
  return DRILL_ROUTE_RE.test(pathname) ? DRILL_STEMS : LOBBY_STEMS;
}

/**
 * Persistent music toggle. One AudioContext for the whole session, all 7
 * stems run phase-locked. Lobby routes hear LOBBY_STEMS (synth + guitar);
 * drill routes hear DRILL_STEMS (all 7). Crossfade on route change keeps
 * the song continuous — no gap, no restart.
 *
 * Default off — browsers block autoplay without a user gesture.
 */
export function ThemeMusic() {
  const pathname = usePathname();
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
      mixer.start(stemsForRoute(pathname)).catch(() => {
        // Autoplay blocked or load failure — flip the toggle back off.
        setOn(false);
      });
    } else {
      mixer.stop();
    }
    // Intentionally excludes `pathname` — route changes are handled by the
    // dedicated effect below, which crossfades stems without restarting
    // playback. Including pathname here would re-await start() on every
    // navigation and undo the crossfade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, hydrated]);

  // Route change → crossfade to the right stem set. No restart, no gap,
  // no autoplay re-prompt — just gain ramps on the existing sources.
  useEffect(() => {
    if (!hydrated || !on) return;
    const mixer = mixerRef.current;
    if (!mixer || !mixer.isPlaying()) return;
    mixer.setActive(stemsForRoute(pathname));
  }, [pathname, on, hydrated]);

  // Resume the AudioContext when the tab regains focus. Browsers (especially
  // Safari) suspend AudioContext when the tab loses focus or during SPA
  // route transitions; without an explicit resume the music stays silent
  // even after the tab comes back. Belt-and-suspenders alongside the
  // statechange handler in LayeredMixer.ensureUserGestureContext.
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
