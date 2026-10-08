import { describe, expect, it } from "vitest";
import { panelImageSrc } from "../lib/image";
import { HATCH_WEB_URL } from "../lib/config";

describe("panel image source (image proxy + fallback)", () => {
  it("routes page images through the Hatch image proxy", () => {
    const src = panelImageSrc("https://pbs.twimg.com/media/abc.jpg?name=large");
    expect(src?.startsWith(`${HATCH_WEB_URL}/api/image-proxy?url=`)).toBe(true);
    expect(decodeURIComponent(src!.split("url=")[1]!.split("&")[0]!)).toBe("https://pbs.twimg.com/media/abc.jpg?name=large");
  });
  it("leaves Hatch's own images alone", () => {
    expect(panelImageSrc(`${HATCH_WEB_URL}/api/fallback-image?symbol=X`)).toBe(`${HATCH_WEB_URL}/api/fallback-image?symbol=X`);
  });
  it("gives no source (so the generated card shows) for empty or non-http URLs", () => {
    for (const bad of [null, undefined, "", "javascript:alert(1)", "chrome://settings", "/relative.png"]) expect(panelImageSrc(bad)).toBeNull();
  });
});
