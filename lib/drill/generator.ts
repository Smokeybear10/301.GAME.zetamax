import type { Op, Problem } from "./types";
import { hashString, mulberry32 } from "./rng";

const OPS: readonly Op[] = ["add", "sub", "mul", "div"] as const;

/**
 * Pure function. Same (seedHash, index) produces the same Problem, every time.
 *
 * Each problem forks an independent RNG stream, so changing the number of
 * rng() calls within one op does not shift later problems' outputs.
 */
export function generateProblem(seedHash: number, index: number): Problem {
  const rng = mulberry32((seedHash + index * 0x9e3779b1) >>> 0);
  const op = OPS[Math.floor(rng() * OPS.length)];

  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case "add": {
      a = randInt(rng, 2, 100);
      b = randInt(rng, 2, 100);
      answer = a + b;
      break;
    }
    case "sub": {
      // Pick the result and the subtrahend; minuend is their sum.
      // Guarantees minuend ≥ subtrahend ≥ 2 and result in [2, 100].
      const result = randInt(rng, 2, 100);
      const subtrahend = randInt(rng, 2, 100);
      a = result + subtrahend;
      b = subtrahend;
      answer = result;
      break;
    }
    case "mul": {
      // Small factor in [2, 12], large factor in [2, 100]. Random display order.
      const small = randInt(rng, 2, 12);
      const large = randInt(rng, 2, 100);
      if (rng() < 0.5) {
        a = small;
        b = large;
      } else {
        a = large;
        b = small;
      }
      answer = small * large;
      break;
    }
    case "div": {
      // Quotient in [2, 100], divisor in [2, 12]. Dividend = product.
      const quotient = randInt(rng, 2, 100);
      const divisor = randInt(rng, 2, 12);
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
export function generateFromSeed(seed: string, index: number): Problem {
  return generateProblem(hashString(seed), index);
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
