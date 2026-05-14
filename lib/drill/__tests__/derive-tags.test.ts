import { describe, expect, it } from "vitest";
import {
  TAG_VERSION,
  _internals,
  deriveTags,
  type PatternTag,
  type SkillTag,
  type TagKey,
} from "../derive-tags";
import type { Op } from "../types";

type Case = {
  a: number;
  b: number;
  op: Op;
  skill: SkillTag;
  patterns: PatternTag[]; // expected, in precedence order
  attribution: TagKey;
};

/**
 * Table-driven coverage: every skill tag and every pattern tag has at least
 * three representative examples here. If a rule changes, the table breaks
 * loudly.
 */
const CASES: ReadonlyArray<Case> = [
  // ─── add-easy (both operands < 10) ─────────────────────────────────────
  { a: 4, b: 5, op: "add", skill: "add-easy", patterns: [], attribution: "add-easy" },
  { a: 8, b: 1, op: "add", skill: "add-easy", patterns: ["complement-near"], attribution: "complement-near" },
  { a: 3, b: 2, op: "add", skill: "add-easy", patterns: [], attribution: "add-easy" },

  // ─── add-no-carry (multi-digit, zero carries) ──────────────────────────
  { a: 23, b: 45, op: "add", skill: "add-no-carry", patterns: [], attribution: "add-no-carry" },
  { a: 12, b: 30, op: "add", skill: "add-no-carry", patterns: [], attribution: "add-no-carry" },
  { a: 50, b: 24, op: "add", skill: "add-no-carry", patterns: [], attribution: "add-no-carry" },
  { a: 33, b: 22, op: "add", skill: "add-no-carry", patterns: ["repeated-digit"], attribution: "repeated-digit" },

  // ─── add-carry-once (exactly 1 carry) ──────────────────────────────────
  { a: 47, b: 38, op: "add", skill: "add-carry-once", patterns: [], attribution: "add-carry-once" },
  { a: 56, b: 34, op: "add", skill: "add-carry-once", patterns: [], attribution: "add-carry-once" },
  { a: 29, b: 13, op: "add", skill: "add-carry-once", patterns: ["complement-near"], attribution: "complement-near" }, // 29 has units 9

  // ─── add-carry-multi (≥2 carries) ──────────────────────────────────────
  { a: 87, b: 76, op: "add", skill: "add-carry-multi", patterns: [], attribution: "add-carry-multi" },
  { a: 99, b: 99, op: "add", skill: "add-carry-multi", patterns: ["double", "complement-near", "repeated-digit", "same-tens"], attribution: "double" },
  { a: 67, b: 89, op: "add", skill: "add-carry-multi", patterns: ["complement-near"], attribution: "complement-near" }, // 89 has units 9

  // ─── sub-easy (both operands < 10) ─────────────────────────────────────
  { a: 9, b: 3, op: "sub", skill: "sub-easy", patterns: ["complement-near"], attribution: "complement-near" }, // 9 has units 9
  { a: 7, b: 2, op: "sub", skill: "sub-easy", patterns: [], attribution: "sub-easy" },
  { a: 5, b: 4, op: "sub", skill: "sub-easy", patterns: [], attribution: "sub-easy" },

  // ─── sub-no-borrow (multi-digit, zero borrows) ─────────────────────────
  { a: 87, b: 32, op: "sub", skill: "sub-no-borrow", patterns: [], attribution: "sub-no-borrow" },
  { a: 96, b: 24, op: "sub", skill: "sub-no-borrow", patterns: [], attribution: "sub-no-borrow" },
  { a: 50, b: 20, op: "sub", skill: "sub-no-borrow", patterns: [], attribution: "sub-no-borrow" },

  // ─── sub-borrow-once (exactly 1 borrow) ────────────────────────────────
  { a: 73, b: 46, op: "sub", skill: "sub-borrow-once", patterns: [], attribution: "sub-borrow-once" },
  { a: 50, b: 23, op: "sub", skill: "sub-borrow-once", patterns: [], attribution: "sub-borrow-once" },
  { a: 84, b: 56, op: "sub", skill: "sub-borrow-once", patterns: [], attribution: "sub-borrow-once" },

  // ─── sub-borrow-multi (≥2 borrows) ─────────────────────────────────────
  { a: 110, b: 23, op: "sub", skill: "sub-borrow-multi", patterns: [], attribution: "sub-borrow-multi" },
  { a: 121, b: 89, op: "sub", skill: "sub-borrow-multi", patterns: ["complement-near"], attribution: "complement-near" }, // 89 has units 9
  { a: 813, b: 487, op: "sub", skill: "sub-borrow-multi", patterns: [], attribution: "sub-borrow-multi" },

  // ─── mul-table (both factors in 2..12) ─────────────────────────────────
  { a: 4, b: 7, op: "mul", skill: "mul-table", patterns: [], attribution: "mul-table" },
  { a: 5, b: 8, op: "mul", skill: "mul-table", patterns: [], attribution: "mul-table" },
  { a: 12, b: 3, op: "mul", skill: "mul-table", patterns: [], attribution: "mul-table" },

  // ─── mul-large (at least one factor > 12) ──────────────────────────────
  { a: 7, b: 54, op: "mul", skill: "mul-large", patterns: [], attribution: "mul-large" },
  { a: 8, b: 42, op: "mul", skill: "mul-large", patterns: [], attribution: "mul-large" },
  { a: 12, b: 35, op: "mul", skill: "mul-large", patterns: [], attribution: "mul-large" },

  // ─── div-table (divisor 2..12 AND quotient 2..12) ──────────────────────
  { a: 56, b: 7, op: "div", skill: "div-table", patterns: [], attribution: "div-table" }, // 56/7=8
  { a: 96, b: 8, op: "div", skill: "div-table", patterns: [], attribution: "div-table" }, // 96/8=12
  { a: 30, b: 6, op: "div", skill: "div-table", patterns: [], attribution: "div-table" }, // 30/6=5

  // ─── div-large (quotient > 12) ─────────────────────────────────────────
  { a: 91, b: 7, op: "div", skill: "div-large", patterns: [], attribution: "div-large" }, // 91/7=13
  { a: 84, b: 4, op: "div", skill: "div-large", patterns: [], attribution: "div-large" }, // 84/4=21
  { a: 78, b: 6, op: "div", skill: "div-large", patterns: [], attribution: "div-large" }, // 78/6=13

  // ─── pattern: double ───────────────────────────────────────────────────
  { a: 7, b: 7, op: "add", skill: "add-easy", patterns: ["double"], attribution: "double" },
  { a: 8, b: 8, op: "mul", skill: "mul-table", patterns: ["double", "near-square"], attribution: "double" },
  { a: 25, b: 25, op: "add", skill: "add-carry-once", patterns: ["double", "same-tens"], attribution: "double" }, // 25+25=50, units 5+5=10 carry, tens 2+2+1=5 no carry → 1 carry; same tens (2)

  // ─── pattern: near-square (mul only) ───────────────────────────────────
  { a: 7, b: 8, op: "mul", skill: "mul-table", patterns: ["near-square"], attribution: "near-square" },
  { a: 11, b: 12, op: "mul", skill: "mul-table", patterns: ["near-square", "by-11", "repeated-digit"], attribution: "near-square" }, // 11 has repeated digits
  { a: 6, b: 7, op: "mul", skill: "mul-table", patterns: ["near-square"], attribution: "near-square" },

  // ─── pattern: by-9 ─────────────────────────────────────────────────────
  { a: 9, b: 7, op: "mul", skill: "mul-table", patterns: ["by-9"], attribution: "by-9" },
  { a: 9, b: 54, op: "mul", skill: "mul-large", patterns: ["by-9"], attribution: "by-9" },
  { a: 81, b: 9, op: "div", skill: "div-table", patterns: ["by-9"], attribution: "by-9" }, // 81/9=9, divisor 9 → by-9

  // ─── pattern: by-11 ────────────────────────────────────────────────────
  { a: 11, b: 7, op: "mul", skill: "mul-table", patterns: ["by-11", "repeated-digit"], attribution: "by-11" }, // 11 repeated
  { a: 11, b: 40, op: "mul", skill: "mul-large", patterns: ["by-11", "repeated-digit"], attribution: "by-11" }, // 11 repeated
  { a: 132, b: 11, op: "div", skill: "div-table", patterns: ["by-11", "repeated-digit"], attribution: "by-11" }, // 132/11=12; 11 repeated

  // ─── pattern: complement-near ──────────────────────────────────────────
  { a: 49, b: 33, op: "add", skill: "add-carry-once", patterns: ["complement-near", "repeated-digit"], attribution: "complement-near" }, // 33 repeated
  { a: 73, b: 21, op: "sub", skill: "sub-no-borrow", patterns: ["complement-near"], attribution: "complement-near" },
  { a: 51, b: 19, op: "add", skill: "add-carry-once", patterns: ["complement-near"], attribution: "complement-near" },

  // ─── pattern: repeated-digit ───────────────────────────────────────────
  { a: 77, b: 22, op: "add", skill: "add-no-carry", patterns: ["repeated-digit"], attribution: "repeated-digit" },
  { a: 33, b: 8, op: "mul", skill: "mul-large", patterns: ["repeated-digit"], attribution: "repeated-digit" },
  { a: 66, b: 33, op: "sub", skill: "sub-no-borrow", patterns: ["repeated-digit"], attribution: "repeated-digit" }, // both repeated, same-tens? 6 vs 3 → no

  // ─── pattern: same-tens ────────────────────────────────────────────────
  { a: 47, b: 45, op: "add", skill: "add-carry-once", patterns: ["same-tens"], attribution: "same-tens" },
  { a: 56, b: 52, op: "add", skill: "add-carry-once", patterns: ["same-tens"], attribution: "same-tens" }, // 6+2=8 no carry, 5+5=10 carry → 1 carry
  { a: 78, b: 73, op: "sub", skill: "sub-no-borrow", patterns: ["same-tens"], attribution: "same-tens" },

  // ─── edge cases ────────────────────────────────────────────────────────
  // 9×9: mul-table + double + near-square + by-9 → double wins
  { a: 9, b: 9, op: "mul", skill: "mul-table", patterns: ["double", "near-square", "by-9"], attribution: "double" },
  // 11×11: mul-table + double + near-square + by-11 + repeated-digit → double wins
  { a: 11, b: 11, op: "mul", skill: "mul-table", patterns: ["double", "near-square", "by-11", "repeated-digit"], attribution: "double" },
  // 12×12: mul-table + double + near-square → double wins
  { a: 12, b: 12, op: "mul", skill: "mul-table", patterns: ["double", "near-square"], attribution: "double" },
  // 49+1: add-carry-once + complement-near (49 units 9, 1 units 1)
  { a: 49, b: 1, op: "add", skill: "add-carry-once", patterns: ["complement-near"], attribution: "complement-near" },
  // 1×1: mul-large (1 not in 2..12) + double; no near-square (factors not in 2..12)
  { a: 1, b: 1, op: "mul", skill: "mul-large", patterns: ["double"], attribution: "double" },
  // 100÷10=10: div-table (divisor 10, quotient 10), no patterns
  { a: 100, b: 10, op: "div", skill: "div-table", patterns: [], attribution: "div-table" },
  // 99-9: sub-borrow-once (units 9-9=0, tens 9-0 with borrow? wait 9 < 10 so single-digit treatment... a=99 ≥10 so multi-digit. 99-9: units 9-9=0 no borrow, tens 9-0=9 no borrow → 0 borrows → sub-no-borrow). Plus 99 has repeated-digit, units 9 → complement-near. complement-near wins.
  { a: 99, b: 9, op: "sub", skill: "sub-no-borrow", patterns: ["complement-near", "repeated-digit"], attribution: "complement-near" },
];

describe("deriveTags table", () => {
  for (const c of CASES) {
    const label = `${c.a} ${opSym(c.op)} ${c.b} → ${c.attribution}`;
    it(label, () => {
      const result = deriveTags(c.a, c.b, c.op);
      expect(result.skillTag).toBe(c.skill);
      expect(result.patternTags).toEqual(c.patterns);
      expect(result.attribution).toBe(c.attribution);
      expect(result.version).toBe(TAG_VERSION);
    });
  }
});

describe("deriveTags coverage", () => {
  it("every skill tag has at least 3 covering examples", () => {
    const counts = new Map<SkillTag, number>();
    for (const c of CASES) {
      counts.set(c.skill, (counts.get(c.skill) ?? 0) + 1);
    }
    const required: SkillTag[] = [
      "add-easy", "add-no-carry", "add-carry-once", "add-carry-multi",
      "sub-easy", "sub-no-borrow", "sub-borrow-once", "sub-borrow-multi",
      "mul-table", "mul-large",
      "div-table", "div-large",
    ];
    for (const tag of required) {
      expect(counts.get(tag) ?? 0, `${tag} coverage`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every pattern tag has at least 3 attribution examples", () => {
    const counts = new Map<PatternTag, number>();
    for (const c of CASES) {
      if (c.patterns.length > 0) {
        for (const p of c.patterns) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    const required: PatternTag[] = [
      "double", "near-square", "by-9", "by-11",
      "complement-near", "repeated-digit", "same-tens",
    ];
    for (const tag of required) {
      expect(counts.get(tag) ?? 0, `${tag} coverage`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("internal helpers", () => {
  it("countAddCarries handles single and multi-digit", () => {
    expect(_internals.countAddCarries(4, 5)).toBe(0);
    expect(_internals.countAddCarries(9, 1)).toBe(1);
    expect(_internals.countAddCarries(47, 38)).toBe(1);
    expect(_internals.countAddCarries(87, 76)).toBe(2);
    expect(_internals.countAddCarries(99, 99)).toBe(2);
    expect(_internals.countAddCarries(0, 0)).toBe(0);
  });

  it("countSubBorrows handles single and multi-digit", () => {
    expect(_internals.countSubBorrows(9, 3)).toBe(0);
    expect(_internals.countSubBorrows(87, 32)).toBe(0);
    expect(_internals.countSubBorrows(73, 46)).toBe(1);
    expect(_internals.countSubBorrows(110, 23)).toBe(2);
    expect(_internals.countSubBorrows(813, 487)).toBe(2);
  });

  it("hasRepeatedDigit", () => {
    expect(_internals.hasRepeatedDigit(11)).toBe(true);
    expect(_internals.hasRepeatedDigit(77)).toBe(true);
    expect(_internals.hasRepeatedDigit(99)).toBe(true);
    expect(_internals.hasRepeatedDigit(12)).toBe(false);
    expect(_internals.hasRepeatedDigit(100)).toBe(false); // 1, 0, 0 — not all same
    expect(_internals.hasRepeatedDigit(111)).toBe(true);
    expect(_internals.hasRepeatedDigit(5)).toBe(false); // single-digit doesn't qualify
    expect(_internals.hasRepeatedDigit(0)).toBe(false);
  });

  it("computeAnswer", () => {
    expect(_internals.computeAnswer(4, 5, "add")).toBe(9);
    expect(_internals.computeAnswer(10, 3, "sub")).toBe(7);
    expect(_internals.computeAnswer(7, 8, "mul")).toBe(56);
    expect(_internals.computeAnswer(56, 7, "div")).toBe(8);
  });
});

describe("attribution invariant", () => {
  it("when patternTags is non-empty, attribution equals the first pattern", () => {
    for (const c of CASES) {
      const result = deriveTags(c.a, c.b, c.op);
      if (result.patternTags.length > 0) {
        expect(result.attribution).toBe(result.patternTags[0]);
      } else {
        expect(result.attribution).toBe(result.skillTag);
      }
    }
  });
});

function opSym(op: Op): string {
  switch (op) {
    case "add": return "+";
    case "sub": return "−";
    case "mul": return "×";
    case "div": return "÷";
  }
}
