/**
 * Runs only on the Hatch web app (matches are set to HATCH_WEB_URL's origin at build time in
 * wxt.config.ts). Forwards the web app's HATCH_EVENT messages (wallet connected / token launched)
 * to the background. Only public addresses ever cross; never keys or signatures.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { HATCH_WEB_ORIGIN } from "../lib/config";
import type { BgRequest } from "../lib/messages";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default defineContentScript({
  // Placeholder; replaced with the HATCH_WEB_URL origin by the build:manifestGenerated hook.
  matches: ["http://localhost/*"],
  runAt: "document_start",
  main() {
    if (location.origin !== HATCH_WEB_ORIGIN) return;
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.origin !== HATCH_WEB_ORIGIN || event.source !== window) return;
      const d = event.data as { type?: unknown; event?: unknown; wallet?: unknown; mint?: unknown } | null;
      if (!d || d.type !== "HATCH_EVENT") return;
      if ((d.event !== "launched" && d.event !== "wallet") || typeof d.wallet !== "string" || !ADDRESS.test(d.wallet)) return;
      const msg: BgRequest = {
        type: "hatch-event",
        event: d.event,
        wallet: d.wallet,
        ...(typeof d.mint === "string" && ADDRESS.test(d.mint) ? { mint: d.mint } : {}),
      };
      void browser.runtime.sendMessage(msg).catch(() => undefined);
    });
  },
});
