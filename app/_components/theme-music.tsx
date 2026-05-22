"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "zetamax:music-on";
const TRACK_URL = "/audio/name-in-numbers.mp3";
const TRACK_VOLUME = 0.4;

/**
 * Persistent theme-music toggle. Default off — browsers block audio autoplay
 * without user interaction anyway. User's choice persists across sessions
 * via localStorage. Small corner control so it doesn't fight the monochrome
 * design.
 */
export function ThemeMusic() {
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Hydrate state from localStorage. Default off.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setOn(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Drive the audio element from state.
  useEffect(() => {
    if (!hydrated) return;
    const el = audioRef.current;
    if (!el) return;
    el.volume = TRACK_VOLUME;
    if (on) {
      el.play().catch(() => {
        // Autoplay blocked. Reset state so the toggle reflects reality.
        setOn(false);
      });
    } else {
      el.pause();
    }
  }, [on, hydrated]);

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
    <>
      <audio ref={audioRef} src={TRACK_URL} loop preload="auto" />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "Mute theme music" : "Play theme music"}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase border border-white/15 text-white/65 hover:text-white hover:border-white/40 bg-black/40 backdrop-blur-sm transition-colors"
      >
        {on ? "♪ on" : "♪ off"}
      </button>
    </>
  );
}
