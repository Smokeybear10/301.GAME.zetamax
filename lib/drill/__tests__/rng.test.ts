import { describe, expect, it } from "vitest";
import { hashString, mulberry32 } from "../rng";

describe("mulberry32", () => {
  it("produces deterministic streams from the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different streams from different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a() !== b()) differences++;
    }
    expect(differences).toBeGreaterThan(95);
  });

  it("yields values in [0, 1)", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("zetamax")).toBe(hashString("zetamax"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("zetamax")).not.toBe(hashString("zetamax!"));
  });

  it("returns a uint32", () => {
    const h = hashString("test");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });
});
