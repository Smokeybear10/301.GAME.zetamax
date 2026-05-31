"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-answer feedback preferences, independent of the music toggle. SFX is
 * off by default (sound is opt-in); haptic is on by default (cheap, silent,
 * only fires on devices with a vibration motor).
 */
export type FeedbackSettings = { sfx: boolean; haptic: boolean };

const DEFAULTS: FeedbackSettings = { sfx: false, haptic: true };
const KEY = "zetamax:feedback-settings";

let state: FeedbackSettings = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function getFeedbackSettings(): FeedbackSettings {
  hydrate();
  return state;
}

export function setFeedbackSfx(on: boolean): void {
  state = { ...state, sfx: on };
  persist();
  listeners.forEach((l) => l());
}

export function setFeedbackHaptic(on: boolean): void {
  state = { ...state, haptic: on };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeedbackSettings(): FeedbackSettings {
  return useSyncExternalStore(subscribe, getFeedbackSettings, () => DEFAULTS);
}
