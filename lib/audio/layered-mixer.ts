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
  synth: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/synth.mp3",
  bass: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/bass.mp3",
  drums: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/drums.mp3",
  percussion: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/percussion.mp3",
  guitar: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/guitar.mp3",
  "backing-vocals": "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/backing-vocals.mp3",
  vocals: "https://cdn.jsdelivr.net/gh/Smokeybear10/803.DATA.music@main/zetamax/audio/stems/vocals.mp3",
};

/**
 * Warm the HTTP cache for every stem. Safe to call before any user gesture —
 * no AudioContext required. Bytes land in the browser disk cache so the later
 * mixer.start() fetches return locally instead of waiting on ~56 MB of
 * cross-origin transfers from jsDelivr. Best-effort: network errors are
 * swallowed because failing the preload should never break the page.
 */
export function preloadStems(): void {
  if (typeof window === "undefined") return;
  STEMS.forEach((stem) => {
    void fetch(STEM_URLS[stem], { cache: "force-cache" }).catch(() => {});
  });
}

/** Stems active on the lobby / non-drill routes. Pure pad — mostly ambient. */
export const LOBBY_STEMS: readonly Stem[] = ["synth"] as const;

/**
 * Drill tier ladder. Each entry adds its stem to the active set once the
 * player's PEAK streak OR cumulative correct answers (this round) crosses
 * the threshold — whichever comes first. Once a tier is earned it stays
 * for the round (audio ratchets up only).
 *
 * Two paths, same numbers: bursty players reach tiers via streak (locking
 * in fast rhythmic flow); steady players reach the same tiers via score
 * accumulation (so a slower, accurate driller still hears the full song).
 *
 * Backing vocals enter early (tier 6) for vocal warmth; lead vocals stay
 * at tier 15 as the peak reward.
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

/**
 * Tier set unlocked by the higher of peakStreak and score (whichever is
 * further along the ladder). Both metrics ratchet up monotonically within
 * a round and reset between rounds, so this naturally implements the
 * "earn it and keep it" behavior.
 */
export function activeStemsForPlay(
  peakStreak: number,
  score: number,
): Stem[] {
  const m = Math.max(peakStreak, score);
  return DRILL_TIERS.filter((t) => m >= t.threshold).map((t) => t.stem);
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
  // Reentrancy guard for start(). Multiple React effects can race to call
  // start() before the first one finishes loading (e.g. pathname changes
  // mid-load). Without this guard, each call creates a fresh set of
  // BufferSourceNodes; the old ones keep playing on the AudioContext but
  // get orphaned from `stemSources`, so the user hears the same stem
  // twice at different positions. The promise serializes concurrent calls.
  private startInFlight: Promise<void> | null = null;
  // Common loop length across all stems — the minimum buffer duration so
  // every source restarts on the same instant. Stems from Suno's exporter
  // are within a few ms of each other; without a shared loop point they
  // drift out of phase over a few minutes of play.
  private loopSeconds = 0;

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
      // Use the shortest stem's duration as the shared loop length. Every
      // source loops on this boundary, so they never drift apart no matter
      // how long playback runs.
      this.loopSeconds = Math.min(
        ...Array.from(this.buffers.values()).map((b) => b.duration),
      );
    })();
    return this.loadPromise;
  }

  /**
   * Start playback with the given initial stem set. Creates the AudioContext
   * on first call (must be invoked from a user-gesture handler to satisfy
   * browser autoplay policy).
   *
   * Reentrancy-safe: if a previous start() is still loading buffers, this
   * call awaits the in-flight load instead of starting a second set of
   * BufferSourceNodes (which would orphan the first set on the context and
   * the user would hear each stem twice at different positions).
   */
  async start(initialStems: readonly Stem[]): Promise<void> {
    if (this.startInFlight) {
      await this.startInFlight;
      this.setActive(initialStems);
      return;
    }
    if (this.playing) {
      this.setActive(initialStems);
      return;
    }
    this.startInFlight = this.beginPlayback(initialStems);
    try {
      await this.startInFlight;
    } finally {
      this.startInFlight = null;
    }
  }

  private async beginPlayback(initialStems: readonly Stem[]): Promise<void> {
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

    // Defensive cleanup — if any tracked sources are hanging around from a
    // prior failed attempt, kill them before creating fresh ones. Untracked
    // orphans (from a pre-fix race) will already have been collected when
    // the AudioContext was torn down via stop()/destroy().
    this.stemSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    this.stemSources.clear();

    // Start every stem looped at the same instant so they stay phase-locked.
    // loopEnd is set to the shortest stem's duration so all sources wrap
    // simultaneously and never drift, even after minutes of playback.
    const startAt = this.ctx.currentTime;
    STEMS.forEach((stem) => {
      const buf = this.buffers.get(stem);
      const gain = this.stemGains.get(stem);
      if (!buf || !gain) return;
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = this.loopSeconds || buf.duration;
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
