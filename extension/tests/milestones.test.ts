import { describe, expect, it } from "vitest";
import { diffMilestones } from "../lib/milestones";
import type { HatchSummary } from "../lib/types";

const hatch = (over: Partial<HatchSummary> = {}): HatchSummary => ({
  name: "minos test",
  symbol: "MINOS",
  mint: "GVSetikTDtVAviwTq1MbNY5n6dGa6T1eb2v2c5ybG6Gq",
  pool: "6N7JK5XZ2yUxF9L4pbXqXsDbYJ8pRfT6229Zxtsk8ME8",
  preset: "STOCK",
  progress: 19.8,
  status: "Incubating",
  claimableCreatorFees: { amount: "0", symbol: "NVDAx", hasFees: false },
  tokenUrl: "/token/GVSetikTDtVAviwTq1MbNY5n6dGa6T1eb2v2c5ybG6Gq",
  ...over,
});

describe("diffMilestones", () => {
  it("records first sight silently", () => {
    const { events, next } = diffMilestones({}, [hatch({ status: "Hatched", progress: 100 })]);
    expect(events).toEqual([]);
    expect(next[hatch().mint]).toMatchObject({ hatched: true, almost: true });
  });

  it("announces crossing 80% once, with a notification", () => {
    const first = diffMilestones({}, [hatch()]);
    const crossed = diffMilestones(first.next, [hatch({ progress: 81, status: "Almost hatched" })]);
    expect(crossed.events).toEqual([{ mint: hatch().mint, text: "MINOS is 80% to hatching", url: hatch().tokenUrl, notify: true }]);
    expect(diffMilestones(crossed.next, [hatch({ progress: 90, status: "Almost hatched" })]).events).toEqual([]);
  });

  it("announces hatching", () => {
    const first = diffMilestones({}, [hatch({ progress: 85, status: "Almost hatched" })]);
    const hatched = diffMilestones(first.next, [hatch({ progress: 100, status: "Hatched" })]);
    expect(hatched.events.map((e) => e.text)).toEqual(["MINOS hatched!"]);
  });

  it("reminds about claimable fees once (bubble only) and re-arms after claiming", () => {
    const fees = { amount: "0.25", symbol: "NVDAx", hasFees: true };
    const a = diffMilestones({}, [hatch()]);
    const b = diffMilestones(a.next, [hatch({ claimableCreatorFees: fees })]);
    expect(b.events).toEqual([expect.objectContaining({ text: "You can claim 0.25 NVDAx in creator fees on MINOS", notify: false })]);
    expect(diffMilestones(b.next, [hatch({ claimableCreatorFees: fees })]).events).toEqual([]);
    const claimed = diffMilestones(b.next, [hatch()]);
    expect(diffMilestones(claimed.next, [hatch({ claimableCreatorFees: fees })]).events).toHaveLength(1);
  });
});
