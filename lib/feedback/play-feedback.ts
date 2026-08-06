"use client";

import { getFeedbackSettings } from "./feedback-settings";

/**
 * Imperative per-answer feedback: sound, haptic, and a visual flash on the
 * typed-answer element. All fire-and-forget — no React state, no awaits — so
 * the keystroke→paint path stays untouched. Sound reuses one lazily-created
 * AudioContext, separate from the music mixer.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, ms: number, peak = 0.18): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // short attack/decay envelope so it reads as a tick, not a beep
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

/** Digit keypress tick. SFX-gated. */
export function feedbackTick(): void {
  if (getFeedbackSettings().sfx) tone(720, 45, 0.12);
}

/** Skip blip. SFX-gated. */
export function feedbackSkip(): void {
  if (getFeedbackSettings().sfx) tone(380, 40, 0.12);
}

/** Correct answer: white bloom on the typed element + confirm tone + haptic. */
export function feedbackCorrect(el: HTMLElement | null): void {
  const { sfx, haptic } = getFeedbackSettings();
  if (sfx) tone(1180, 95, 0.2);
  if (haptic) vibrate(12);
  bloom(el, "zp-correct-bloom");
}

/** Wrong/cleared answer: red underglow + low tone (no haptic). */
export function feedbackWrong(el: HTMLElement | null): void {
  if (getFeedbackSettings().sfx) tone(300, 70, 0.16);
  bloom(el, "zp-wrong-glow");
}

function bloom(el: HTMLElement | null, cls: string): void {
  if (!el) return;
  el.classList.remove("zp-correct-bloom", "zp-wrong-glow");
  // force reflow so re-adding the class re-triggers the animation
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), 140);
}

function vibrate(ms: number): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(ms);
  } catch {
    // unsupported / blocked
  }
}
