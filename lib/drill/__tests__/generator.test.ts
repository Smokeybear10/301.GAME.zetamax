import { describe, expect, it } from "vitest";
import { generateFromSeed, generateProblem } from "../generator";
import { hashString } from "../rng";

describe("generateProblem", () => {
  const seedHash = hashString("test");

  it("is deterministic — same (seed, index) returns the same problem", () => {
    const p1 = generateProblem(seedHash, 0);
    const p2 = generateProblem(seedHash, 0);
    expect(p1).toEqual(p2);
  });

  it("produces stable problem ids", () => {
    expect(generateProblem(seedHash, 0).id).toBe("p0");
    expect(generateProblem(seedHash, 7).id).toBe("p7");
  });

  it("addition operands are in [2, 100] and answer is correct", () => {
    let count = 0;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem(seedHash, i);
      if (p.op !== "add") continue;
      count++;
      expect(p.a).toBeGreaterThanOrEqual(2);
      expect(p.a).toBeLessThanOrEqual(100);
      expect(p.b).toBeGreaterThanOrEqual(2);
      expect(p.b).toBeLessThanOrEqual(100);
      expect(p.answer).toBe(p.a + p.b);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("subtraction has minuend ≥ subtrahend, result in [2, 100]", () => {
    let count = 0;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem(seedHash, i);
      if (p.op !== "sub") continue;
      count++;
      expect(p.a).toBeGreaterThanOrEqual(p.b);
      expect(p.answer).toBe(p.a - p.b);
      expect(p.answer).toBeGreaterThanOrEqual(2);
      expect(p.answer).toBeLessThanOrEqual(100);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("multiplication: at least one factor in [2, 12], answer is product", () => {
    let count = 0;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem(seedHash, i);
      if (p.op !== "mul") continue;
      count++;
      const small = Math.min(p.a, p.b);
      expect(small).toBeGreaterThanOrEqual(2);
      expect(small).toBeLessThanOrEqual(12);
      expect(p.answer).toBe(p.a * p.b);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("division: divisor in [2, 12], quotient in [2, 100], integer answer", () => {
    let count = 0;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem(seedHash, i);
      if (p.op !== "div") continue;
      count++;
      expect(p.b).toBeGreaterThanOrEqual(2);
      expect(p.b).toBeLessThanOrEqual(12);
      expect(p.answer).toBe(p.a / p.b);
      expect(p.answer).toBeGreaterThanOrEqual(2);
      expect(p.answer).toBeLessThanOrEqual(100);
      expect(Number.isInteger(p.answer)).toBe(true);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("op distribution is roughly uniform over a long stream", () => {
    const counts: Record<string, number> = { add: 0, sub: 0, mul: 0, div: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[generateProblem(seedHash, i).op]++;
    }
    // Each op should appear ~1000 times. Allow ±15% tolerance.
    for (const op of ["add", "sub", "mul", "div"]) {
      expect(counts[op]).toBeGreaterThan(850);
      expect(counts[op]).toBeLessThan(1150);
    }
  });

  it("generateFromSeed agrees with generateProblem on the same seed", () => {
    const p1 = generateFromSeed("hello", 5);
    const p2 = generateProblem(hashString("hello"), 5);
    expect(p1).toEqual(p2);
  });

  it("different seeds produce different streams", () => {
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      const p1 = generateFromSeed("seed-a", i);
      const p2 = generateFromSeed("seed-b", i);
      if (p1.op !== p2.op || p1.a !== p2.a || p1.b !== p2.b) differences++;
    }
    expect(differences).toBeGreaterThan(80);
  });

  it("respects op enabled flags in the config", () => {
    // Only addition enabled — every problem must be add.
    const onlyAdd = {
      ops: {
        add: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
        sub: { enabled: false, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
        mul: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
        div: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
      },
    };
    for (let i = 0; i < 200; i++) {
      const p = generateProblem(seedHash, i, onlyAdd);
      expect(p.op).toBe("add");
    }
  });

  it("respects custom addition ranges", () => {
    const tinyAdd = {
      ops: {
        add: { enabled: true, aMin: 1, aMax: 5, bMin: 1, bMax: 5 },
        sub: { enabled: false, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
        mul: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
        div: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
      },
    };
    for (let i = 0; i < 200; i++) {
      const p = generateProblem(seedHash, i, tinyAdd);
      expect(p.a).toBeGreaterThanOrEqual(1);
      expect(p.a).toBeLessThanOrEqual(5);
      expect(p.b).toBeGreaterThanOrEqual(1);
      expect(p.b).toBeLessThanOrEqual(5);
    }
  });

  it("falls back to add if all ops are disabled", () => {
    const allDisabled = {
      ops: {
        add: { enabled: false, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
        sub: { enabled: false, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
        mul: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
        div: { enabled: false, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
      },
    };
    const p = generateProblem(seedHash, 0, allDisabled);
    expect(p.op).toBe("add");
  });
});
