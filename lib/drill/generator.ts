import { ZETAMAC_DEFAULTS, type GeneratorConfig } from "./config";
import { deriveTags } from "./derive-tags";
import { hashString, mulberry32 } from "./rng";
import type { Op, Problem } from "./types";

const ALL_OPS: readonly Op[] = ["add", "sub", "mul", "div"] as const;

/** Default cap on rejection-sampling candidates per targeted problem. */
const DEFAULT_MAX_CANDIDATES = 50;

/** Salt mixed into the candidate-index hash so candidates don't collide with the index stream. */
const CANDIDATE_SALT = 0xc2b2ae35;

/** Salt for picking which target tag a given problem index aims at. */
const TAG_PICK_SALT = 0x85ebca77;

/**
 * Pure function. Same (seedHash, index, config) produces the same Problem.
 *
 * Each problem forks an independent RNG stream so changing internals doesn't
 * shift later problems' outputs.
 *
 * Config controls which ops are enabled and the operand ranges. Defaults to
 * ZETAMAC_DEFAULTS for back-compat with code that doesn't pass a config.
 *
 * If `config.targeting` is set, the function rejection-samples up to
 * `maxCandidates` times for a problem whose `deriveTags(...).attribution`
 * matches one of the target tags. The target tag for this index is chosen
 * deterministically from `config.targeting.tags`. If no candidate matches,
 * the last candidate is returned as a fallback (better than blocking).
 */
export function generateProblem(
  seedHash: number,
  index: number,
  config: GeneratorConfig = ZETAMAC_DEFAULTS,
): Problem {
  if (config.targeting && config.targeting.tags.length > 0) {
    return generateTargetedProblem(seedHash, index, config);
  }
  return generateBaseProblem(seedHash, index, config);
}

function generateBaseProblem(
  seedHash: number,
  index: number,
  config: GeneratorConfig,
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

function generateTargetedProblem(
  seedHash: number,
  index: number,
  config: GeneratorConfig,
): Problem {
  const targeting = config.targeting!;
  const maxCandidates = targeting.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  // Deterministically pick which target tag this problem index aims at.
  const tagRng = mulberry32((seedHash ^ TAG_PICK_SALT) + index * 0x9e3779b1);
  const targetTag = targeting.tags[Math.floor(tagRng() * targeting.tags.length)];

  // Strip targeting from the config we pass to base — we only want vanilla
  // problem generation in the candidate space.
  const baseConfig: GeneratorConfig = { ops: config.ops };

  let lastCandidate: Problem | null = null;
  for (let c = 0; c < maxCandidates; c++) {
    // Unique candidate-index per (index, c) so candidate streams across
    // different problem indices don't collide.
    const candidateIndex = (index * maxCandidates + c) ^ CANDIDATE_SALT;
    const candidate = generateBaseProblem(seedHash, candidateIndex, baseConfig);
    const tags = deriveTags(candidate.a, candidate.b, candidate.op);
    if (tags.attribution === targetTag) {
      return { ...candidate, id: `p${index}` };
    }
    lastCandidate = candidate;
  }
  // Fallback — return the last candidate with the canonical id. Better than
  // blocking the round when the target is impossible (e.g., user disabled the
  // op the tag belongs to).
  return { ...lastCandidate!, id: `p${index}` };
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
