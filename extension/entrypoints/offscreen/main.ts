/**
 * Offscreen document (chrome.offscreen, reason AUDIO_PLAYBACK): the only place Hatch plays audio,
 * so page autoplay rules and CSPs can't block it. The background sends what to play and how loud.
 */
import { browser } from "wxt/browser";
import type { OffscreenMessage } from "../../lib/messages";

browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const msg = raw as OffscreenMessage;
  if (msg?.target !== "hatch-offscreen" || msg.type !== "play") return false;
  if (!msg.src.startsWith(browser.runtime.getURL("/"))) return false; // only our own bundled sounds
  const audio = new Audio(msg.src);
  audio.volume = Math.max(0, Math.min(1, msg.volume));
  audio.play().then(
    () => sendResponse({ played: true }),
    (e: unknown) => sendResponse({ played: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // async response
});
