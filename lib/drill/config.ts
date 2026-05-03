import type { Op } from "./types";

/**
 * Per-operation configuration. Two operand ranges + an enabled flag.
 *
 * What the ranges mean depends on the op (the underlying generator preserves
 * the Zetamac convention: subtraction and division derive a "displayed"
 * problem from result+subtrahend / quotient*divisor pairs):
 *
 *   add  : a + b           a in [aMin, aMax],  b in [bMin, bMax]
 *   sub  : (a+b) - b       aRange = result,    bRange = subtrahend
 *   mul  : a × b           aRange and bRange are both factors (random display order)
 *   div  : (q*d) ÷ d = q   aRange = divisor (small),  bRange = quotient (large)
 *
 * Defaults: mul has aMin/aMax = 2..12 (small) and bMin/bMax = 2..100 (large).
 * div uses the same shape (divisor in 2..12, answer/quotient in 2..100).
 *
 * UI labels can hide this — Zetamac just shows "X to Y +/-/×/÷ X to Y".
 */
export type OpRange = {
  enabled: boolean;
  aMin: number;
  aMax: number;
  bMin: number;
  bMax: number;
};

export type GeneratorConfig = {
  ops: Record<Op, OpRange>;
};

export const ZETAMAC_DEFAULTS: GeneratorConfig = {
  ops: {
    add: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
    sub: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
    mul: { enabled: true, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
    div: { enabled: true, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
  },
};

/** Round duration presets (ms). User can also enter a custom value. */
export const DURATION_PRESETS_MS = [
  30_000, 60_000, 90_000, 120_000, 180_000, 300_000, 600_000,
] as const;

export const DEFAULT_DURATION_MS = 120_000;

/**
 * Key bindings for the three control actions during a round. Defaults match
 * Zetamac (Enter/Tab/Backspace). Digits are reserved for input — never bindable.
 */
export type KeyBinds = {
  submit: string;
  skip: string;
  delete: string;
};

export const KEYBIND_DEFAULTS: KeyBinds = {
  submit: "Enter",
  skip: "Tab",
  delete: "Backspace",
};

/** Keys that must never be bound (would break input or escape). */
export const RESERVED_KEYS = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Escape",
]);

/** Top-level config consumed by the practice route. */
export type PracticeConfig = {
  durationMs: number;
  generator: GeneratorConfig;
  keybinds: KeyBinds;
};

export const PRACTICE_DEFAULTS: PracticeConfig = {
  durationMs: DEFAULT_DURATION_MS,
  generator: ZETAMAC_DEFAULTS,
  keybinds: KEYBIND_DEFAULTS,
};

/** Sanity check — falls back to defaults for any malformed/missing fields. */
export function normalizePracticeConfig(
  input: Partial<PracticeConfig> | null | undefined,
): PracticeConfig {
  if (!input || typeof input !== "object") return PRACTICE_DEFAULTS;
  const dur =
    typeof input.durationMs === "number" &&
    input.durationMs >= 5_000 &&
    input.durationMs <= 3_600_000
      ? input.durationMs
      : DEFAULT_DURATION_MS;

  const gen: GeneratorConfig = { ops: { ...ZETAMAC_DEFAULTS.ops } };
  if (input.generator?.ops) {
    for (const op of ["add", "sub", "mul", "div"] as const) {
      const incoming = input.generator.ops[op];
      if (!incoming) continue;
      const fallback = ZETAMAC_DEFAULTS.ops[op];
      gen.ops[op] = {
        enabled:
          typeof incoming.enabled === "boolean"
            ? incoming.enabled
            : fallback.enabled,
        aMin: clampInt(incoming.aMin, fallback.aMin, 0, 9999),
        aMax: clampInt(incoming.aMax, fallback.aMax, 0, 9999),
        bMin: clampInt(incoming.bMin, fallback.bMin, 0, 9999),
        bMax: clampInt(incoming.bMax, fallback.bMax, 0, 9999),
      };
      // Ensure aMin <= aMax and bMin <= bMax — swap if user inverted.
      if (gen.ops[op].aMin > gen.ops[op].aMax) {
        [gen.ops[op].aMin, gen.ops[op].aMax] = [gen.ops[op].aMax, gen.ops[op].aMin];
      }
      if (gen.ops[op].bMin > gen.ops[op].bMax) {
        [gen.ops[op].bMin, gen.ops[op].bMax] = [gen.ops[op].bMax, gen.ops[op].bMin];
      }
    }
  }

  // Must have at least one op enabled — fall back to add if all disabled.
  const anyEnabled = Object.values(gen.ops).some((o) => o.enabled);
  if (!anyEnabled) gen.ops.add.enabled = true;

  // Keybinds: any string, but reject reserved (digits, Escape) and dedup
  // collisions by falling back to the default for the colliding slot.
  const keybinds: KeyBinds = { ...KEYBIND_DEFAULTS };
  if (input.keybinds && typeof input.keybinds === "object") {
    const claimed = new Set<string>();
    for (const slot of ["submit", "skip", "delete"] as const) {
      const v = input.keybinds[slot];
      const fallback = KEYBIND_DEFAULTS[slot];
      const candidate =
        typeof v === "string" && v.length > 0 && !RESERVED_KEYS.has(v) ? v : fallback;
      keybinds[slot] = claimed.has(candidate) ? fallback : candidate;
      claimed.add(keybinds[slot]);
    }
  }

  return { durationMs: dur, generator: gen, keybinds };
}

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

/** True iff the generator config matches Zetamac defaults exactly. */
export function isZetamacDefaults(gen: GeneratorConfig): boolean {
  for (const op of ["add", "sub", "mul", "div"] as const) {
    const a = gen.ops[op];
    const b = ZETAMAC_DEFAULTS.ops[op];
    if (
      a.enabled !== b.enabled ||
      a.aMin !== b.aMin ||
      a.aMax !== b.aMax ||
      a.bMin !== b.bMin ||
      a.bMax !== b.bMax
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Digit cap on the typed answer. Defaults: 4 (Zetamac's max answer is mul
 * 12×100=1200). Custom ranges: no cap — user is in expert mode.
 */
export const ZETAMAC_DEFAULT_DIGIT_CAP = 4;

export function maxAnswerDigits(gen: GeneratorConfig): number {
  return isZetamacDefaults(gen) ? ZETAMAC_DEFAULT_DIGIT_CAP : Infinity;
}
