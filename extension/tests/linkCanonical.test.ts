import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalize, linkIdHash, lookupPrefix, matchLookup } from "../lib/linkCanonical";

describe("link canonical ids (shared with the web app)", () => {
  it("is byte-for-byte the web app's module (web/src/lib/links/canonical.ts is the source of truth)", () => {
    const here = readFileSync(fileURLToPath(new URL("../lib/linkCanonical.ts", import.meta.url)), "utf8");
    const web = readFileSync(fileURLToPath(new URL("../../web/src/lib/links/canonical.ts", import.meta.url)), "utf8");
    expect(here).toBe(web);
  });

  it("maps the same tweet, video and repo to one id from any URL form", () => {
    expect(canonicalize("https://twitter.com/jack/status/20?s=20").canonicalId).toBe("x:status:20");
    expect(canonicalize("https://x.com/i/web/status/20").canonicalId).toBe("x:status:20");
    expect(canonicalize("https://youtu.be/dQw4w9WgXcQ?t=3").canonicalId).toBe("yt:video:dQw4w9WgXcQ");
    expect(canonicalize("https://github.com/Solana-Labs/Solana/tree/master").canonicalId).toBe("gh:repo:solana-labs/solana");
    expect(canonicalize("https://www.example.com/a/?utm_source=1#x").canonicalId).toBe("web:example.com/a");
  });

  it("private lookup: only an 8-hex prefix leaves the browser; the full hash is matched locally", async () => {
    const h = await linkIdHash("x:status:20");
    expect(lookupPrefix(h)).toMatch(/^[0-9a-f]{8}$/);
    expect(matchLookup([{ h: "0".repeat(64) }, { h }], h)).toEqual({ h });
  });
});
