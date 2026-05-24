"use client";

/**
 * Layered stem mixer for the Zetamax theme. All 7 stems run in phase under
 * a single AudioContext so we can crossfade them in and out without ever
 * desyncing the rhythm. Gain ramps are short on the way in (~600ms) and
 * longer on the way out (~1500ms) so layers feel like they're being earned
 * but a combo break feels like a moment, not a punishment.
 *
 * Two callers drive the gain state:
 *   - The pathname (lobby vs drill) sets the base stem set.
 *   - During a drill, the streak count picks which tiers are active.
 */

export const STEMS = [
  "synth",
  "bass",
  "drums",
  "percussion",
  "guitar",
  "backing-vocals",
  "vocals",
] as const;
export type Stem = (typeof STEMS)[number];

const STEM_URLS: Record<Stem, string> = {
  synth: "/audio/stems/synth.mp3",
  bass: "/audio/stems/bass.mp3",
  drums: "/audio/stems/drums.mp3",
  percussion: "/audio/stems/percussion.mp3",
  guitar: "/audio/stems/guitar.mp3",
  "backing-vocals": "/audio/stems/backing-vocals.mp3",
  vocals: "/audio/stems/vocals.mp3",
};

/** Stems active on the lobby / non-drill routes. Pure pad — mostly ambient. */
export const LOBBY_STEMS: readonly Stem[] = ["synth"] as const;

/**
 * Streak-driven tier ladder for drill screens. Each entry adds its stem to
 * the active set once the player's streak crosses the threshold. Thresholds
 * are "consecutive correct answers, each submitted within 2s of the
 * previous" — matches the visible streak counter.
 *
 * Backing vocals enter early (streak 6) so the song gets vocal warmth
 * without giving away the lead — the full lead vocal remains the peak
 * reward at streak 15.
 */
const DRILL_TIERS: ReadonlyArray<{ threshold: number; stem: Stem }> = [
  { threshold: 0, stem: "synth" },
  { threshold: 2, stem: "bass" },
  { threshold: 4, stem: "drums" },
  { threshold: 6, stem: "backing-vocals" },
  { threshold: 8, stem: "percussion" },
  { threshold: 11, stem: "guitar" },
  { threshold: 15, stem: "vocals" },
];

export function activeStemsForStreak(streak: number): Stem[] {
  return DRILL_TIERS.filter((t) => streak >= t.threshold).map((t) => t.stem);
}

const FADE_IN_MS = 600;
const FADE_OUT_MS = 1500;
const MASTER_VOLUME = 0.4;

export class LayeredMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stemGains: Map<Stem, GainNode> = new Map();
  private stemSources: Map<Stem, AudioBufferSourceNode> = new Map();
  private buffers: Map<Stem, AudioBuffer> = new Map();
  private active: Set<Stem> = new Set();
  private playing = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Decode all 7 stems into AudioBuffers. Idempotent — repeated calls reuse
   * the in-flight or completed load. Roughly 50 MB of audio data; runs once
   * on first `start()` then sticks around for the page lifetime.
   */
  private load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return Promise.resolve();

    this.loadPromise = (async () => {
      const decodes = STEMS.map(async (stem) => {
        const res = await fetch(STEM_URLS[stem]);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        this.buffers.set(stem, buf);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(master);
        this.stemGains.set(stem, gain);
      });
      await Promise.all(decodes);
    })();
    return this.loadPromise;
  }

  /**
   * Start playback with the given initial stem set. Creates the AudioContext
   * on first call (must be invoked from a user-gesture handler to satisfy
   * browser autoplay policy).
   */
  async start(initialStems: readonly Stem[]): Promise<void> {
    if (this.playing) {
      this.setActive(initialStems);
      return;
    }
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    await this.load();

    // Start every stem looped at the same instant so they stay phase-locked.
    const startAt = this.ctx.currentTime;
    STEMS.forEach((stem) => {
      const buf = this.buffers.get(stem);
      const gain = this.stemGains.get(stem);
      if (!buf || !gain) return;
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start(startAt);
      this.stemSources.set(stem, src);
    });
    this.playing = true;
    this.setActive(initialStems);
  }

  /** Silence + tear down all stem sources. AudioContext is reused on next start. */
  stop(): void {
    if (!this.playing) return;
    this.stemSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    this.stemSources.clear();
    this.playing = false;
    this.active.clear();
  }

  /**
   * Crossfade to the given stem set. Stems entering ramp up over FADE_IN_MS;
   * stems leaving ramp down over FADE_OUT_MS (longer so combo break feels
   * like a slow exhale, not a slap).
   */
  setActive(stems: readonly Stem[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const newSet = new Set(stems);
    const now = ctx.currentTime;

    STEMS.forEach((stem) => {
      const gain = this.stemGains.get(stem);
      if (!gain) return;
      const shouldBeActive = newSet.has(stem);
      const target = shouldBeActive ? 1 : 0;
      const rampMs = shouldBeActive ? FADE_IN_MS : FADE_OUT_MS;
      const current = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
      gain.gain.linearRampToValueAtTime(target, now + rampMs / 1000);
    });
    this.active = newSet;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Release WebAudio resources. Call once when unmounting permanently. */
  async destroy(): Promise<void> {
    this.stop();
    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
    this.stemGains.clear();
    this.buffers.clear();
    this.loadPromise = null;
  }
}
