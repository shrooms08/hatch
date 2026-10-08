/**
 * Background worker (shell ported from GLANCE's entrypoints/background.ts): the only extension
 * context that talks to the Hatch web app for content scripts. Opens the side panel, asks the AI
 * whether a flagged page is worth a hint (once per URL per session), stores the wallet address
 * the web app reports, polls the user's hatches (every minute while one is incubating, else every
 * 10 minutes) and announces milestones.
 * It never holds keys, wallets or API keys.
 */
import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { api } from "../lib/api";
import { HATCH_WEB_ORIGIN, POLL_MINUTES, tokenPageUrl } from "../lib/config";
import { SIDEPANEL_PORT, type BgRequest, type NoticeResponse, type OffscreenMessage, type OffscreenResult, type TabMessage } from "../lib/messages";
import { SOUNDS, type SoundName } from "../lib/buddy/config";
import { diffMilestones } from "../lib/milestones";
import { KEYS, getLocal, getSettings, incubatingCount, setLocal, type HatchesCache, type Milestones } from "../lib/storage";

const POLL_ALARM = "hatch-poll";
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NOTIFICATION_URLS = "hatch:notificationUrls";

// ---- sounds: all audio plays in an offscreen document (page autoplay rules can't block it) ----
const OFFSCREEN_URL = "/offscreen.html" as const;
let creatingOffscreen: Promise<void> | null = null;
let lastChirpAt = 0;

async function ensureOffscreen(): Promise<boolean> {
  if (!browser.offscreen) return false;
  const open = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [browser.runtime.getURL(OFFSCREEN_URL)] });
  if (open.length > 0) return true;
  creatingOffscreen ??= browser.offscreen
    .createDocument({ url: OFFSCREEN_URL, reasons: ["AUDIO_PLAYBACK"], justification: "Plays Hatch's short chirps when the side panel opens/closes and when a token hatches." })
    .finally(() => (creatingOffscreen = null));
  await creatingOffscreen;
  return true;
}

/** URL of a bundled file. The sfx are copied by a build hook, so WXT's typed paths don't list them. */
const assetUrl = (path: string) => (browser.runtime.getURL as (p: string) => string)(path);

async function playSound(name: SoundName) {
  if (!(await getSettings()).sounds) return;
  if (name === "chirp") {
    const now = Date.now();
    if (now - lastChirpAt < SOUNDS.chirpThrottleMs) return;
    lastChirpAt = now;
  }
  if (!(await ensureOffscreen())) return;
  const s = SOUNDS[name];
  const msg: OffscreenMessage = { target: "hatch-offscreen", type: "play", src: assetUrl(`/${s.file}`), volume: s.volume };
  const r = (await browser.runtime.sendMessage(msg).catch((e: unknown) => ({ played: false, error: String(e) }))) as OffscreenResult | undefined;
  await browser.storage.session.set({ [KEYS.lastSound]: { name, at: Date.now(), played: !!r?.played, error: r?.error } });
}

/** Crack-and-burst on every page showing the buddy (hidden tabs play it when next shown). */
async function broadcastHatch() {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id ? sendToTab(t.id, { type: "hatch" }) : undefined)));
}

async function sendToTab(tabId: number, msg: TabMessage) {
  await browser.tabs.sendMessage(tabId, msg).catch(() => undefined);
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

// ---- noticing: at most one AI call per URL per browser session ----
async function notice(page: Extract<BgRequest, { type: "notice" }>["page"]): Promise<NoticeResponse> {
  const key = page.url.split("#")[0]!;
  const cache = ((await browser.storage.session.get(KEYS.noticed))[KEYS.noticed] ?? {}) as Record<string, string | null>;
  if (key in cache) return { hint: cache[key] ?? null };
  cache[key] = null; // claim the URL before the request so concurrent asks don't double-call
  await browser.storage.session.set({ [KEYS.noticed]: cache });
  const r = await api.notice(page);
  const hint = r.ok && r.data.worthIt && r.data.hint ? r.data.hint : null;
  cache[key] = hint;
  await browser.storage.session.set({ [KEYS.noticed]: cache });
  return { hint };
}

// ---- tracking ----
async function setBadge(count: number) {
  await browser.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await browser.action.setBadgeBackgroundColor({ color: "#4d7c0f" });
}

async function notifyChrome(text: string, url: string) {
  const id = await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon/128.png"),
    title: "Hatch",
    message: text,
  });
  const map = ((await browser.storage.session.get(NOTIFICATION_URLS))[NOTIFICATION_URLS] ?? {}) as Record<string, string>;
  map[id] = url;
  await browser.storage.session.set({ [NOTIFICATION_URLS]: map });
}

async function poll() {
  const wallet = await getLocal<string | null>(KEYS.wallet, null);
  if (!wallet) return;
  const r = await api.hatches(wallet);
  if (!r.ok) {
    const prev = await getLocal<HatchesCache | null>(KEYS.hatches, null);
    await setLocal(KEYS.hatches, { wallet, at: prev?.at ?? 0, list: prev?.wallet === wallet ? prev.list : [], error: r.error } satisfies HatchesCache);
    return;
  }
  const list = r.data.hatches;
  await setLocal(KEYS.hatches, { wallet, at: Date.now(), list } satisfies HatchesCache);
  await setBadge(incubatingCount(list));

  const { next, events } = diffMilestones(await getLocal<Milestones>(KEYS.milestones, {}), list);
  await setLocal(KEYS.milestones, next);
  const tabId = events.length ? await activeTabId() : undefined;
  for (const e of events) {
    const url = tokenPageUrl(e.url);
    if (tabId) await sendToTab(tabId, { type: "bubble", text: e.text, url });
    if (e.notify) await notifyChrome(e.text, url);
  }
  if (events.some((e) => e.kind === "hatched")) {
    await broadcastHatch();
    await playSound("chirpDouble");
  }
}

/** Every minute while something is incubating; every 10 minutes when nothing is. */
const IDLE_POLL_MS = 10 * 60_000;
async function pollIfDue() {
  const cache = await getLocal<HatchesCache | null>(KEYS.hatches, null);
  const incubating = cache ? incubatingCount(cache.list) : 0;
  if (cache && !cache.error && incubating === 0 && Date.now() - cache.at < IDLE_POLL_MS) return;
  await poll();
}

async function ensurePolling() {
  const wallet = await getLocal<string | null>(KEYS.wallet, null);
  if (!wallet) {
    await browser.alarms.clear(POLL_ALARM);
    await setBadge(0);
    return;
  }
  if (!(await browser.alarms.get(POLL_ALARM))) await browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_MINUTES });
}

export default defineBackground(() => {
  // Toolbar click opens the side panel (Chrome).
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  browser.runtime.onInstalled.addListener(() => void ensurePolling());
  browser.runtime.onStartup.addListener(() => void ensurePolling());
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === POLL_ALARM) void pollIfDue();
  });
  browser.notifications.onClicked.addListener(async (id) => {
    const map = ((await browser.storage.session.get(NOTIFICATION_URLS))[NOTIFICATION_URLS] ?? {}) as Record<string, string>;
    if (map[id]) await browser.tabs.create({ url: map[id] });
    await browser.notifications.clear(id);
  });

  // The side panel holds a port open while it is open: connect = opened, disconnect = closed.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== SIDEPANEL_PORT) return;
    void playSound("chirp");
    port.onDisconnect.addListener(() => void playSound("chirp"));
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const msg = raw as BgRequest;
    if ((raw as { target?: string })?.target === "hatch-offscreen") return false; // for the offscreen document
    if (!msg || typeof msg.type !== "string") return false;
    (async () => {
      switch (msg.type) {
        case "notice":
          return notice(msg.page);
        case "open-side-panel": {
          const tab = sender.tab;
          if (tab?.id) await browser.sidePanel.open({ tabId: tab.id }).catch(() => browser.sidePanel.open({ windowId: tab.windowId! }));
          return { ok: true };
        }
        case "egg-state":
          await sendToTab(msg.tabId, { type: "egg-state", state: msg.state });
          return { ok: true };
        case "hatch-event": {
          // Only from our bridge script on the Hatch web app (it checks event.origin too).
          let fromHatch = false;
          try {
            fromHatch = !!sender.url && new URL(sender.url).origin === HATCH_WEB_ORIGIN;
          } catch {
            fromHatch = false;
          }
          if (!sender.tab || !fromHatch || !SOLANA_ADDRESS.test(msg.wallet)) return { ok: false, error: "bad event" };
          const prev = await getLocal<string | null>(KEYS.wallet, null);
          if (prev !== msg.wallet) {
            await setLocal(KEYS.wallet, msg.wallet);
            await setLocal(KEYS.milestones, {});
          }
          await ensurePolling();
          if (msg.event === "launched") {
            await broadcastHatch();
            await playSound("chirpDouble");
          }
          await poll();
          return { ok: true };
        }
        case "page-changed":
          return { ok: true }; // for the side panel (it listens to runtime messages too)
        case "play-sound":
          await playSound(msg.sound);
          return { ok: true };
        case "refresh-hatches":
          await poll();
          return { ok: true };
        case "forget-wallet":
          await browser.storage.local.remove([KEYS.wallet, KEYS.hatches, KEYS.milestones]);
          await ensurePolling();
          return { ok: true };
        default:
          return { ok: false, error: "Unknown message" };
      }
    })().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  });
});
