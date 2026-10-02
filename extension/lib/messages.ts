/**
 * Typed messages between the content scripts, the background worker and the side panel
 * (pattern from GLANCE's lib/messages.ts). Content scripts never call the web app directly.
 */
import { browser } from "wxt/browser";
import type { EggState, PageContext } from "./types";

/** To the background worker. */
export type BgRequest =
  /** Content script flagged this page locally; ask the AI once per URL per session. */
  | { type: "notice"; page: Pick<PageContext, "url" | "title" | "text" | "detected"> }
  | { type: "open-side-panel" }
  /** Side panel: show this state on the egg in the given tab. */
  | { type: "egg-state"; tabId: number; state: EggState }
  /** Bridge (web app page): a wallet connected or a token launched. */
  | { type: "hatch-event"; event: "launched" | "wallet"; wallet: string; mint?: string }
  | { type: "refresh-hatches" }
  | { type: "forget-wallet" };

export type NoticeResponse = { hint: string | null };

/** From the background or side panel to a tab's content script. */
export type TabMessage =
  | { type: "get-context" }
  | { type: "egg-state"; state: EggState }
  | { type: "tracking"; count: number }
  | { type: "bubble"; text: string; url?: string };

export function sendToBackground<T = unknown>(msg: BgRequest): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}
