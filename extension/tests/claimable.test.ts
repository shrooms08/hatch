import { describe, expect, it } from "vitest";
import { claimableLine } from "../lib/claimable";
import type { HatchSummary } from "../lib/types";

// GCHIP-like: 48,060 lamports of unclaimed creator fees, as /api/hatches reports them.
const gchip: HatchSummary = {
  name: "Green Chip Hatchling", symbol: "GCHIP", mint: "HFXWB1araE22DeLP9zP2K3iu4rcE7N5qUvPgSQ78zow5", pool: "Guefiz1ESQuA5hBWKDi8SRugcpK6uR8LrrPJds7WQxbw",
  preset: "MEME", progress: 0.1, status: "Incubating", tokenUrl: "/token/HFXWB1araE22DeLP9zP2K3iu4rcE7N5qUvPgSQ78zow5",
  claimableCreatorFees: { amount: "0.0₄4806", ui: "0.00004806", raw: "48060", decimals: 9, symbol: "SOL", hasFees: true },
};

describe("claimable fees line (My Hatches > Created)", () => {
  it("shows the web's totals as-is: tiny amounts in subscript-zero form, not 'Nothing to claim yet'", () => {
    expect(claimableLine({ list: [gchip], totals: [{ symbol: "SOL", amount: "0.0₄4806", ui: "0.00004806" }] })).toBe("0.0₄4806 SOL");
  });

  it("the v0.6.1 bug: parsing the display string gave NaN and hid the fees", () => {
    expect(Number(gchip.claimableCreatorFees.amount)).toBeNaN();
    // Without server totals (an older cache) the per-hatch display amounts are listed, never parsed.
    expect(claimableLine({ list: [gchip] })).toBe("0.0₄4806 SOL");
  });

  it("several quote tokens, and nothing to claim", () => {
    expect(claimableLine({ list: [], totals: [{ symbol: "SOL", amount: "0.0123", ui: "0.0123" }, { symbol: "NVDAx", amount: "0.01418", ui: "0.01418" }] })).toBe("0.0123 SOL · 0.01418 NVDAx");
    expect(claimableLine({ list: [{ ...gchip, claimableCreatorFees: { ...gchip.claimableCreatorFees, amount: "0", ui: "0", raw: "0", hasFees: false } }], totals: [] })).toBeNull();
  });
});
