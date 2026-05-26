"use client";

import { useSyncExternalStore } from "react";

/**
 * Persistent music settings. Lives outside React so the LayeredMixer can
 * read the latest volume during a user-gesture handler without waiting
 * for a re-render. The settings dropdown writes via the setters; the
 * ThemeMusic component subscribes via useMusicSettings() and applies
 * the values to the mixer.
 *
 * `on` is NOT persisted — see ThemeMusic's docblock for why we never
 * auto-restore the on state on page load.
 */
export type MusicSettings = {
  /** Master volume 0..1. Persisted. */
  volume: number;
  /** When false, the drill never layers in extra stems — lobby mix only. */
  dynamicStems: boolean;
};

const STORAGE_KEY = "zetamax:music-settings:v1";

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  volume: 0.65,
  dynamicStems: true,
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function load(): MusicSettings {
  if (typeof window === "undefined") return DEFAULT_MUSIC_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MUSIC_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<MusicSettings>;
    return {
      volume:
        typeof parsed.volume === "number"
          ? clamp01(parsed.volume)
          : DEFAULT_MUSIC_SETTINGS.volume,
      dynamicStems:
        typeof parsed.dynamicStems === "boolean"
          ? parsed.dynamicStems
          : DEFAULT_MUSIC_SETTINGS.dynamicStems,
    };
  } catch {
    return DEFAULT_MUSIC_SETTINGS;
  }
}

let state: MusicSettings = DEFAULT_MUSIC_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  state = load();
  hydrated = true;
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota full — non-critical, in-memory state still applies
  }
}

function emit(): void {
  listeners.forEach((l) => l());
}

export function setMusicVolume(volume: number): void {
  ensureHydrated();
  const next = clamp01(volume);
  if (next === state.volume) return;
  state = { ...state, volume: next };
  persist();
  emit();
}

export function setMusicDynamicStems(dynamicStems: boolean): void {
  ensureHydrated();
  if (dynamicStems === state.dynamicStems) return;
  state = { ...state, dynamicStems };
  persist();
  emit();
}

export function getMusicSettings(): MusicSettings {
  ensureHydrated();
  return state;
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): MusicSettings {
  return DEFAULT_MUSIC_SETTINGS;
}

export function useMusicSettings(): MusicSettings {
  return useSyncExternalStore(subscribe, getMusicSettings, getServerSnapshot);
}
