import { describe, expect, it } from "vitest";
import { canAutoNotice } from "../lib/detect";
import { stripUrl } from "../lib/api";

describe("privacy", () => {
  it("strips query strings and hashes before page URLs leave the browser", () => {
    expect(stripUrl("https://example.com/news/q3?utm_source=x&email=a%40b.com#comments")).toBe("https://example.com/news/q3");
    expect(stripUrl("https://x.com/user/status/123?s=20")).toBe("https://x.com/user/status/123");
  });

  it("only stock pages and tweets are ever noticed automatically", () => {
    expect(canAutoNotice("https://finance.yahoo.com/quote/NVDA/")).toBe(true);
    expect(canAutoNotice("https://x.com/jack/status/20")).toBe(true);
    expect(canAutoNotice("https://www.nytimes.com/2026/10/08/business/nvidia.html")).toBe(false);
    expect(canAutoNotice("https://mail.google.com/mail/u/0/#inbox")).toBe(false);
  });
});
