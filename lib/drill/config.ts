import type { Op } from "./types";
import type { TagKey } from "./derive-tags";

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

/**
 * Optional tag-targeted sampling. When set, the generator rejection-samples
 * from `generateProblem` until it finds a problem whose `deriveTags(...).attribution`
 * matches one of the targeted tags. The deterministic invariant is preserved:
 * same `(seedHash, index, config-with-targeting)` → same problem.
 *
 * Used by Learn mode. Classic mode leaves this undefined.
 */
export type TargetingConfig = {
  /** Tag keys to target. Each problem index picks one uniformly at random. */
  tags: TagKey[];
  /** Cap on rejection-sampling tries per problem. Defaults to 50. */
  maxCandidates?: number;
};

export type GeneratorConfig = {
  ops: Record<Op, OpRange>;
  targeting?: TargetingConfig;
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

/** Daily mode: hard time cap (5 min). Round ends at this OR target count, whichever first. */
export const DAILY_DURATION_MS = 300_000;

/** Daily mode: number of correct answers required to complete a round. */
export const DAILY_TARGET_COUNT = 50;

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
  if (gen.targeting) return false;
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
 * Firm-test simulator presets. Each models a real trading/quant interview
 * math screen so candidates can practice the actual format, not generic
 * Zetamac. The drill engine consumes `generator` + `durationMs` +
 * `negativeMarking` + `maxAttempts`; the UI uses `format`, `pass`, and
 * `competitive` to render an honest "you'd pass" verdict.
 *
 * Thresholds are best-effort public estimates, framed as guidance not gospel.
 * v1 uses integer content; a decimals/fractions/percent generator extension
 * is a separable follow-on to make the harder sims fully accurate.
 */
export type FirmSim = {
  /** URL slug. */
  id: string;
  /** Display name, e.g. "Optiver 80 in 8". */
  name: string;
  /** Firm this models. */
  firm: string;
  /** One-line format summary, e.g. "80 questions · 8 min · −1 per wrong". */
  format: string;
  /** Longer description shown on the preset card. */
  blurb: string;
  generator: GeneratorConfig;
  durationMs: number;
  negativeMarking: boolean;
  /** Fixed question count, or null for time-only formats. */
  maxAttempts: number | null;
  /** Score at/above which you'd likely pass the screen. */
  pass: number;
  /** Score at/above which you'd be a competitive candidate. */
  competitive: number;
};

const ARITHMETIC_ALL: GeneratorConfig = {
  ops: {
    add: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
    sub: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
    mul: { enabled: true, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
    div: { enabled: true, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
  },
};

export const FIRM_SIMS: FirmSim[] = [
  {
    id: "optiver-80-in-8",
    name: "Optiver 80 in 8",
    firm: "Optiver",
    format: "80 questions · 8 min · −1 per wrong",
    blurb:
      "Optiver's infamous timed screen. Negative marking punishes guessing — accuracy matters as much as speed.",
    generator: ARITHMETIC_ALL,
    durationMs: 8 * 60_000,
    negativeMarking: true,
    maxAttempts: 80,
    pass: 56,
    competitive: 70,
  },
  {
    id: "sig-speed",
    name: "SIG Speed",
    firm: "SIG",
    format: "2 min · mixed ops · no penalty",
    blurb:
      "Susquehanna-style rapid arithmetic sprint. Pure speed, no negative marking — answer as many as you can.",
    generator: ARITHMETIC_ALL,
    durationMs: 2 * 60_000,
    negativeMarking: false,
    maxAttempts: null,
    pass: 40,
    competitive: 55,
  },
  {
    id: "imc-arithmetic",
    name: "IMC Arithmetic",
    firm: "IMC",
    format: "3 min · mixed ops",
    blurb:
      "IMC's mental-math round. A touch longer — sustained accuracy under time pressure.",
    generator: ARITHMETIC_ALL,
    durationMs: 3 * 60_000,
    negativeMarking: false,
    maxAttempts: null,
    pass: 55,
    competitive: 75,
  },
  {
    id: "jane-street-mental",
    name: "Jane Street Mental",
    firm: "Jane Street",
    format: "100 questions · 10 min",
    blurb:
      "Long-form endurance set. Finish all 100 if you can — consistency over a burst.",
    generator: ARITHMETIC_ALL,
    durationMs: 10 * 60_000,
    negativeMarking: false,
    maxAttempts: 100,
    pass: 70,
    competitive: 88,
  },
];

export function findFirmSim(id: string): FirmSim | undefined {
  return FIRM_SIMS.find((s) => s.id === id);
}

/**
 * Digit cap on the typed answer. Defaults: 4 (Zetamac's max answer is mul
 * 12×100=1200). Custom ranges: no cap — user is in expert mode.
 */
export const ZETAMAC_DEFAULT_DIGIT_CAP = 4;

export function maxAnswerDigits(gen: GeneratorConfig): number {
  return isZetamacDefaults(gen) ? ZETAMAC_DEFAULT_DIGIT_CAP : Infinity;
}
