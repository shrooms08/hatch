/**
 * Typed messages between the content scripts, the background worker and the side panel
 * (pattern from GLANCE's lib/messages.ts). Content scripts never call the web app directly.
 */
import { browser } from "wxt/browser";
import type { EggState, PageContext } from "./types";
import type { SoundName } from "./buddy/config";

/** To the background worker. */
export type BgRequest =
  /** Content script flagged this page locally; ask the AI once per URL per session. */
  | { type: "notice"; page: Pick<PageContext, "url" | "title" | "text" | "detected"> }
  /** draft: the user clicked a hint, so the panel drafts this page right away. */
  | { type: "open-side-panel"; draft?: { url: string } }
  /** A hint bubble just appeared on this page: double chirp (throttled, lib/chirp). */
  | { type: "heads-up"; url: string }
  /** Supported stocks (cached GET /api/stocks), for the local news heads-up. */
  | { type: "get-stocks" }
  /** Debug page: run the tracking-alert chirp path once. */
  | { type: "debug-alert" }
  /** Side panel: show this state on the egg in the given tab. */
  | { type: "egg-state"; tabId: number; state: EggState }
  /** Bridge (web app page): a wallet connected or a token launched. */
  | { type: "hatch-event"; event: "launched" | "wallet"; wallet: string; mint?: string }
  | { type: "refresh-hatches" }
  | { type: "forget-wallet" }
  /** Debug page: play a sound through the offscreen document (respects the Sounds setting). */
  | { type: "play-sound"; sound: SoundName }
  /** Content script: this tab's URL changed (SPA navigation). The side panel re-reads the page. */
  | { type: "page-changed" }
  /** Content script: is there a link coin for this canonical id? Only an 8-hex hash prefix leaves the browser. */
  | { type: "link-lookup"; canonicalId: string };

export type NoticeResponse = { hint: string | null };
/** null: no answer (links off on this web app, offline, rate limited): show nothing. */
export type LinkLookupResponse = { base: string; status: import("./linkCheck").LinkStatus } | null;

/** From the background or side panel to a tab's content script. */
export type TabMessage =
  | { type: "get-context" }
  | { type: "egg-state"; state: EggState }
  | { type: "tracking"; count: number }
  | { type: "bubble"; text: string; url?: string }
  /** launched / hatched: play the crack-and-burst once. */
  | { type: "hatch" };

/** Background -> offscreen audio document. */
export type OffscreenMessage = { target: "hatch-offscreen"; type: "play"; src: string; volume: number };
export type OffscreenResult = { played: boolean; error?: string };

/** Side panel keeps this port open; the background chirps when it connects and disconnects. */
export const SIDEPANEL_PORT = "hatch-sidepanel";

export function sendToBackground<T = unknown>(msg: BgRequest): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}
