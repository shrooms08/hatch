import { describe, expect, it } from "vitest";
import * as web from "../../web/src/lib/buddyArt";
import * as ext from "../lib/buddy/art";

describe("buddy art", () => {
  it("is identical to the website's (web/src/lib/buddyArt.ts is the source of truth)", () => {
    for (const k of ["GRID", "CHICKEN", "EGG", "CHICKEN_BLINK", "CHICKEN_PECK", "EGG_CRACK", "CELL_COLOR"] as const) expect(ext[k], k).toEqual(web[k]);
    const { ringWidth: a, ...extArt } = ext.ART;
    const { ringWidth: b, ...webArt } = web.ART;
    expect(extArt).toEqual(webArt);
    for (const s of [24, 64, 80, 160]) expect(a(s)).toBe(b(s));
  });

  it("every frame is 11x11 with known cells", () => {
    for (const f of [ext.CHICKEN, ext.EGG, ext.CHICKEN_BLINK, ext.CHICKEN_PECK, ext.EGG_CRACK]) {
      expect(f).toHaveLength(ext.GRID);
      for (const row of f) {
        expect(row).toHaveLength(ext.GRID);
        for (const c of row) expect(ext.CELL_COLOR[c]).toBeDefined();
      }
    }
  });

  it("idle moments change only a few cells; the crack only breaks the egg's middle rows", () => {
    const diff = (a: string[], b: string[]) => a.join("").split("").filter((c, i) => c !== b.join("")[i]).length;
    expect(diff(ext.CHICKEN, ext.CHICKEN_BLINK)).toBe(1);
    expect(diff(ext.CHICKEN, ext.CHICKEN_PECK)).toBe(2);
    expect(diff(ext.EGG, ext.EGG_CRACK)).toBe(7);
    ext.EGG_CRACK.forEach((row, r) => r !== 4 && r !== 5 && expect(row).toBe(ext.EGG[r]));
  });
});
