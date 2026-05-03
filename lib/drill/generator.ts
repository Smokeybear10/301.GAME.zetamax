import { ZETAMAC_DEFAULTS, type GeneratorConfig } from "./config";
import { hashString, mulberry32 } from "./rng";
import type { Op, Problem } from "./types";

const ALL_OPS: readonly Op[] = ["add", "sub", "mul", "div"] as const;

/**
 * Pure function. Same (seedHash, index, config) produces the same Problem.
 *
 * Each problem forks an independent RNG stream so changing internals doesn't
 * shift later problems' outputs.
 *
 * Config controls which ops are enabled and the operand ranges. Defaults to
 * ZETAMAC_DEFAULTS for back-compat with code that doesn't pass a config.
 */
export function generateProblem(
  seedHash: number,
  index: number,
  config: GeneratorConfig = ZETAMAC_DEFAULTS,
): Problem {
  const rng = mulberry32((seedHash + index * 0x9e3779b1) >>> 0);

  // Pick from enabled ops only. If somehow none are enabled, default to add.
  const enabledOps = ALL_OPS.filter((op) => config.ops[op].enabled);
  const ops = enabledOps.length > 0 ? enabledOps : (["add"] as const);
  const op = ops[Math.floor(rng() * ops.length)];

  const range = config.ops[op];
  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case "add": {
      a = randInt(rng, range.aMin, range.aMax);
      b = randInt(rng, range.bMin, range.bMax);
      answer = a + b;
      break;
    }
    case "sub": {
      // aRange = result range; bRange = subtrahend range. Minuend = sum.
      // Guarantees minuend ≥ subtrahend and result ≥ aMin.
      const result = randInt(rng, range.aMin, range.aMax);
      const subtrahend = randInt(rng, range.bMin, range.bMax);
      a = result + subtrahend;
      b = subtrahend;
      answer = result;
      break;
    }
    case "mul": {
      const x = randInt(rng, range.aMin, range.aMax);
      const y = randInt(rng, range.bMin, range.bMax);
      // Random display order so the smaller factor isn't always first.
      if (rng() < 0.5) {
        a = x;
        b = y;
      } else {
        a = y;
        b = x;
      }
      answer = x * y;
      break;
    }
    case "div": {
      // aRange = divisor (typically 2..12); bRange = quotient (typically 2..100).
      // Display: "(quotient * divisor) ÷ divisor = quotient" — divisor is the
      // small factor on the right of the ÷, answer is the large factor.
      const divisor = randInt(rng, range.aMin, range.aMax);
      const quotient = randInt(rng, range.bMin, range.bMax);
      a = quotient * divisor;
      b = divisor;
      answer = quotient;
      break;
    }
  }

  return {
    id: `p${index}`,
    op,
    a,
    b,
    answer,
  };
}

/** Convenience wrapper that takes a string seed instead of a hash. */
export function generateFromSeed(
  seed: string,
  index: number,
  config?: GeneratorConfig,
): Problem {
  return generateProblem(hashString(seed), index, config);
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
