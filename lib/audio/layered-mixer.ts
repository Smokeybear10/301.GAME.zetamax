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

const FADE_IN_MS = 600;
const FADE_OUT_MS = 800;
const MASTER_VOLUME = 0.65;

/** Stems active on the lobby / non-drill routes — pad + guitar, no vocals. */
export const LOBBY_STEMS: readonly Stem[] = ["synth", "guitar"] as const;

/** Stems active on drill routes — the full song. */
export const DRILL_STEMS: readonly Stem[] = STEMS;

export class LayeredMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stemGains: Map<Stem, GainNode> = new Map();
  private stemSources: Map<Stem, AudioBufferSourceNode> = new Map();
  private buffers: Map<Stem, AudioBuffer> = new Map();
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
   * Create the AudioContext if it doesn't exist and call resume() on it.
   * MUST be invoked from a synchronous user-gesture handler (e.g. an
   * onClick) before any awaited work — otherwise Chrome/Safari may treat
   * the context as autoplay-blocked and never produce audio even after
   * resume() returns. Safe to call repeatedly; idempotent.
   *
   * Also wires up a statechange handler that auto-resumes the context any
   * time it falls back to "suspended" — happens during SPA route
   * transitions, tab-focus changes, and some browser memory-pressure
   * events. Without this, music drops out mid-session.
   */
  ensureUserGestureContext(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      this.ctx.addEventListener("statechange", () => {
        if (this.ctx?.state === "suspended" && this.playing) {
          // Best-effort resume. May fail without a user gesture, but on
          // navigation/visibility transitions it usually succeeds since
          // the original gesture grant is still credited to the tab.
          void this.ctx.resume().catch(() => {});
        }
      });
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

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
   * Start playback with the given stem set audible (others stay at gain 0,
   * still playing in phase so they can fade in later without resyncing).
   * Creates the AudioContext on first call (must be invoked from a
   * user-gesture handler to satisfy browser autoplay policy).
   *
   * Reentrancy-safe: if a previous start() is still loading buffers, this
   * call awaits the in-flight load instead of starting a second set of
   * BufferSourceNodes (which would orphan the first set on the context and
   * the user would hear each stem twice at different positions).
   */
  async start(activeStems: readonly Stem[]): Promise<void> {
    if (this.startInFlight) {
      await this.startInFlight;
      this.setActive(activeStems);
      return;
    }
    if (this.playing) {
      this.setActive(activeStems);
      return;
    }
    this.startInFlight = this.beginPlayback(activeStems);
    try {
      await this.startInFlight;
    } finally {
      this.startInFlight = null;
    }
  }

  /**
   * Crossfade to a new active stem set. Stems entering ramp up over
   * FADE_IN_MS; stems leaving ramp down over FADE_OUT_MS. Stems already in
   * the right state stay put (no-op ramp).
   */
  setActive(stems: readonly Stem[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const wanted = new Set(stems);
    const now = ctx.currentTime;
    STEMS.forEach((stem) => {
      const gain = this.stemGains.get(stem);
      if (!gain) return;
      const target = wanted.has(stem) ? 1 : 0;
      const rampMs = wanted.has(stem) ? FADE_IN_MS : FADE_OUT_MS;
      const current = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
      gain.gain.linearRampToValueAtTime(target, now + rampMs / 1000);
    });
  }

  private async beginPlayback(activeStems: readonly Stem[]): Promise<void> {
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
    // prior failed attempt, kill them before creating fresh ones.
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
    this.setActive(activeStems);
  }

  /**
   * Fade every stem out and tear down the sources. AudioContext is reused
   * on the next start(). Asynchronous teardown of source nodes happens after
   * the fade-out completes so the user doesn't hear a click.
   */
  stop(): void {
    if (!this.playing) return;
    this.fadeAllOut();
    const ctx = this.ctx;
    const fadeMs = FADE_OUT_MS;
    const toKill = Array.from(this.stemSources.values());
    this.stemSources.clear();
    this.playing = false;
    if (ctx) {
      setTimeout(() => {
        toKill.forEach((src) => {
          try {
            src.stop();
          } catch {
            // already stopped
          }
        });
      }, fadeMs + 50);
    }
  }

  /** Ramp every stem's gain down to 0 over FADE_OUT_MS. */
  private fadeAllOut(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    STEMS.forEach((stem) => {
      const gain = this.stemGains.get(stem);
      if (!gain) return;
      const current = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_MS / 1000);
    });
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
