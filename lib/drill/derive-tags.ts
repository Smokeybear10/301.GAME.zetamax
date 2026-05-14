/**
 * Tag derivation for the weak-pattern diagnostics engine.
 *
 * Pure function. Takes a Zetamac problem (a, b, op) and returns:
 *   - skillTag: exactly one (the "what kind of problem is this", exhaustive)
 *   - patternTags: zero or more (the "what makes this hard", multi-attaching)
 *   - attribution: the single tag this problem contributes to in stats —
 *     pattern wins over skill; among patterns, fixed precedence order
 *     (most-specific first).
 *   - version: TAG_VERSION at derivation time. Bumped when rules change so
 *     historical rows can be filtered/re-tagged.
 *
 * No imports beyond the Op type. Importable from server, client, and tests.
 */

import type { Op } from "./types";

export const TAG_VERSION = 1;

// ============================================================================
// Skill tags — exactly one per problem, exhaustive over Zetamac defaults.
// ============================================================================
export type SkillTag =
  | "add-easy"
  | "add-no-carry"
  | "add-carry-once"
  | "add-carry-multi"
  | "sub-easy"
  | "sub-no-borrow"
  | "sub-borrow-once"
  | "sub-borrow-multi"
  | "mul-table"
  | "mul-large"
  | "div-table"
  | "div-large";

// ============================================================================
// Pattern tags — zero or more per problem, multi-attaching.
// ============================================================================
export type PatternTag =
  | "double"          // a === b
  | "near-square"     // mul, both factors in 2..12, |a-b| ≤ 1
  | "by-9"            // mul/div: factor or quotient is 9
  | "by-11"           // mul/div: factor or quotient is 11
  | "complement-near" // add/sub: any operand has units 1 or 9
  | "repeated-digit"  // any operand ≥ 10 has all-same digits (11, 22, …, 99)
  | "same-tens";      // add/sub: both operands ≥ 10 share the tens digit

export type TagKey = SkillTag | PatternTag;

export type TagSet = {
  skillTag: SkillTag;
  /** All matching patterns, ordered by precedence (most specific first). */
  patternTags: PatternTag[];
  /** Single tag the round attributes to (pattern wins; else skill). */
  attribution: TagKey;
  /** Equals TAG_VERSION at derivation time. */
  version: number;
};

/**
 * Pattern precedence — most-specific first. When multiple patterns match the
 * same problem, the one earliest in this list wins the attribution.
 *
 * Rationale:
 *   double       — exact equality, the most specific structural match
 *   near-square  — small numerical offset, also highly specific
 *   by-9 / by-11 — single-factor specificity (9 and 11 each get a "trick")
 *   complement-near — units-digit specificity (rounding trick)
 *   repeated-digit — visual specificity
 *   same-tens    — broadest, weakest specificity
 */
const PATTERN_PRECEDENCE: PatternTag[] = [
  "double",
  "near-square",
  "by-9",
  "by-11",
  "complement-near",
  "repeated-digit",
  "same-tens",
];

// ============================================================================
// Helpers
// ============================================================================

function computeAnswer(a: number, b: number, op: Op): number {
  switch (op) {
    case "add":
      return a + b;
    case "sub":
      return a - b;
    case "mul":
      return a * b;
    case "div":
      return Math.floor(a / b);
  }
}

/** Number of column carries in a + b. Both operands assumed non-negative. */
function countAddCarries(a: number, b: number): number {
  let carries = 0;
  let carry = 0;
  let aLeft = a;
  let bLeft = b;
  while (aLeft > 0 || bLeft > 0 || carry > 0) {
    const sum = (aLeft % 10) + (bLeft % 10) + carry;
    if (sum >= 10) carries++;
    carry = Math.floor(sum / 10);
    aLeft = Math.floor(aLeft / 10);
    bLeft = Math.floor(bLeft / 10);
  }
  return carries;
}

/** Number of column borrows in a - b. Assumes a >= b (Zetamac guarantees). */
function countSubBorrows(a: number, b: number): number {
  let borrows = 0;
  let borrow = 0;
  let aLeft = a;
  let bLeft = b;
  while (bLeft > 0 || aLeft > 0) {
    const aDigit = (aLeft % 10) - borrow;
    const bDigit = bLeft % 10;
    if (aDigit < bDigit) {
      borrows++;
      borrow = 1;
    } else {
      borrow = 0;
    }
    aLeft = Math.floor(aLeft / 10);
    bLeft = Math.floor(bLeft / 10);
  }
  return borrows;
}

/** True iff the operand is ≥10 and every decimal digit is the same. */
function hasRepeatedDigit(n: number): boolean {
  if (n < 10) return false;
  const s = String(n);
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== s[0]) return false;
  }
  return true;
}

// ============================================================================
// Skill-tag rules
// ============================================================================

function deriveSkillTag(a: number, b: number, op: Op, answer: number): SkillTag {
  switch (op) {
    case "add": {
      if (a < 10 && b < 10) return "add-easy";
      const carries = countAddCarries(a, b);
      if (carries === 0) return "add-no-carry";
      if (carries === 1) return "add-carry-once";
      return "add-carry-multi";
    }
    case "sub": {
      if (a < 10 && b < 10) return "sub-easy";
      const borrows = countSubBorrows(a, b);
      if (borrows === 0) return "sub-no-borrow";
      if (borrows === 1) return "sub-borrow-once";
      return "sub-borrow-multi";
    }
    case "mul": {
      if (a >= 2 && a <= 12 && b >= 2 && b <= 12) return "mul-table";
      return "mul-large";
    }
    case "div": {
      // a is the dividend, b is the divisor, answer is the quotient.
      if (b >= 2 && b <= 12 && answer >= 2 && answer <= 12) return "div-table";
      return "div-large";
    }
  }
}

// ============================================================================
// Pattern-tag rules
// ============================================================================

function derivePatternTags(
  a: number,
  b: number,
  op: Op,
  answer: number,
): PatternTag[] {
  const found = new Set<PatternTag>();

  // double — exact operand equality, applies to any op
  if (a === b) found.add("double");

  // near-square — mul only, both factors in 2..12, adjacent or equal
  if (
    op === "mul" &&
    a >= 2 && a <= 12 &&
    b >= 2 && b <= 12 &&
    Math.abs(a - b) <= 1
  ) {
    found.add("near-square");
  }

  // by-9 / by-11 — mul or div, the "9-trick" and "11-trick" patterns.
  // For mul: either factor.
  // For div: divisor (b) or quotient (answer).
  if (op === "mul") {
    if (a === 9 || b === 9) found.add("by-9");
    if (a === 11 || b === 11) found.add("by-11");
  } else if (op === "div") {
    if (b === 9 || answer === 9) found.add("by-9");
    if (b === 11 || answer === 11) found.add("by-11");
  }

  // complement-near — add/sub, any operand has units 1 or 9
  // (rounds-then-adjust trick: 49+33 → 50+33-1)
  if (op === "add" || op === "sub") {
    const aU = a % 10;
    const bU = b % 10;
    if (aU === 1 || aU === 9 || bU === 1 || bU === 9) {
      found.add("complement-near");
    }
  }

  // repeated-digit — any operand has all-same digits (11, 22, ..., 99, 111…)
  if (hasRepeatedDigit(a) || hasRepeatedDigit(b)) {
    found.add("repeated-digit");
  }

  // same-tens — add/sub, both operands ≥ 10, share the tens digit
  if (
    (op === "add" || op === "sub") &&
    a >= 10 && b >= 10 &&
    Math.floor(a / 10) === Math.floor(b / 10)
  ) {
    found.add("same-tens");
  }

  // Return ordered by precedence — most-specific tag first.
  return PATTERN_PRECEDENCE.filter((p) => found.has(p));
}

// ============================================================================
// Public entry point
// ============================================================================

export function deriveTags(a: number, b: number, op: Op): TagSet {
  const answer = computeAnswer(a, b, op);
  const skillTag = deriveSkillTag(a, b, op, answer);
  const patternTags = derivePatternTags(a, b, op, answer);
  const attribution: TagKey =
    patternTags.length > 0 ? patternTags[0] : skillTag;
  return { skillTag, patternTags, attribution, version: TAG_VERSION };
}

// ============================================================================
// Internal helpers exported for testing only.
// ============================================================================
export const _internals = {
  countAddCarries,
  countSubBorrows,
  hasRepeatedDigit,
  computeAnswer,
};
