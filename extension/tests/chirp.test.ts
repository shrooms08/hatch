import { describe, expect, it } from "vitest";
import { EMPTY_HEADS_UP, HEADS_UP_GAP_MS, alertChirp, alertKey, headsUpChirp } from "../lib/chirp";

describe("heads-up chirp throttle", () => {
  it("plays once per page per session", () => {
    const a = headsUpChirp(EMPTY_HEADS_UP, "https://finance.yahoo.com/quote/NVDA/", 1_000_000);
    expect(a.play).toBe(true);
    const again = headsUpChirp(a.next, "https://finance.yahoo.com/quote/NVDA/#news", 1_000_000 + HEADS_UP_GAP_MS * 5);
    expect(again.play).toBe(false);
  });

  it("plays at most once every 2 minutes overall", () => {
    const a = headsUpChirp(EMPTY_HEADS_UP, "https://a.com/1", 0 + HEADS_UP_GAP_MS);
    const b = headsUpChirp(a.next, "https://b.com/2", HEADS_UP_GAP_MS + 30_000);
    expect(b.play).toBe(false);
    // b.com was seen (silently), so it won't chirp later either; a new page after the gap does.
    expect(headsUpChirp(b.next, "https://b.com/2", HEADS_UP_GAP_MS * 3).play).toBe(false);
    expect(headsUpChirp(b.next, "https://c.com/3", HEADS_UP_GAP_MS * 2 + 1).play).toBe(true);
  });
});

describe("tracking alert chirp", () => {
  it("plays once per token per milestone", () => {
    const first = alertChirp([], [alertKey("mintA", "almost")]);
    expect(first.play).toBe(true);
    expect(alertChirp(first.next, [alertKey("mintA", "almost")]).play).toBe(false);
    expect(alertChirp(first.next, [alertKey("mintA", "hatched")]).play).toBe(true);
    expect(alertChirp(first.next, [alertKey("mintB", "almost")]).play).toBe(true);
    // several events in one poll: one chirp, all remembered
    const two = alertChirp([], [alertKey("m", "almost"), alertKey("m", "fees")]);
    expect(two.play).toBe(true);
    expect(two.next).toEqual(["m:almost", "m:fees"]);
  });
});
