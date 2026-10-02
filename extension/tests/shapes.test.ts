import { describe, expect, it } from "vitest";
import { DOTS } from "../lib/buddy/config";
import { CHICKEN, EGG, chickenClassifier, crackPoints, eggClassifier } from "../lib/buddy/shapes";

describe("buddy shapes", () => {
  it("chicken and egg have exactly DOTS.count dots, within the cap", () => {
    expect(DOTS.count).toBeLessThanOrEqual(250);
    expect(DOTS.count).toBeGreaterThanOrEqual(120);
    expect(CHICKEN.dots).toHaveLength(DOTS.count);
    expect(EGG.dots).toHaveLength(DOTS.count);
  });

  it("puts the outline first so indices morph outline -> outline", () => {
    expect(CHICKEN.dots.slice(0, DOTS.outline).every((d) => d.outline)).toBe(true);
    expect(EGG.dots.slice(0, DOTS.outline).every((d) => d.outline)).toBe(true);
  });

  it("stays inside figure space", () => {
    for (const d of [...CHICKEN.dots, ...EGG.dots]) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(1);
    }
  });

  it("draws a readable chicken: beak, comb, tail, legs, an eye gap", () => {
    const parts = new Set(CHICKEN.dots.map((d) => d.part));
    for (const p of ["body", "head", "beak", "comb", "tail", "leg"]) expect(parts.has(p as never)).toBe(true);
    expect(chickenClassifier(0.5, -0.42)).toBeNull(); // eye
    expect(CHICKEN.dots.some((d) => d.accent)).toBe(true); // Yolk accents (beak/comb/legs)
  });

  it("egg is narrower at the top", () => {
    const widthAt = (y: number) => {
      let w = 0;
      for (let x = 0; x <= 1; x += 0.005) if (eggClassifier(x, y)) w = x;
      return w;
    };
    expect(widthAt(-0.6)).toBeLessThan(widthAt(0.4));
  });

  it("crack is a zigzag across the egg", () => {
    const pts = crackPoints(22);
    expect(pts).toHaveLength(22);
    expect(pts[0]![0]).toBeLessThan(pts[21]![0]);
    // direction of travel in y flips several times (zig, zag)
    let flips = 0;
    for (let i = 2; i < pts.length; i++) {
      const a = pts[i - 1]![1] - pts[i - 2]![1];
      const b = pts[i]![1] - pts[i - 1]![1];
      if (a * b < 0) flips++;
    }
    expect(flips).toBeGreaterThanOrEqual(5);
  });
});
