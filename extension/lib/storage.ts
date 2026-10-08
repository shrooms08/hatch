/** browser.storage keys and typed helpers. No keys, wallets' secrets or API keys are ever stored. */
import { browser } from "wxt/browser";
import type { HatchSummary } from "./types";

export const KEYS = {
  settings: "hatch:settings",
  eggPos: "hatch:eggPos",
  wallet: "hatch:wallet", // public address only
  welcomed: "hatch:welcomed", // the /welcome tab was opened once for this install
  hatches: "hatch:hatches",
  milestones: "hatch:milestones",
  noticed: "hatch:noticed", // storage.session: url -> hint | null
  stocks: "hatch:stocks", // { at, stocks } from GET /api/stocks
  lastSound: "hatch:lastSound", // storage.session: { name, at, played, error? } for the debug page
  headsUp: "hatch:headsUp", // storage.session: heads-up chirp throttle (lib/chirp)
  chirpedAlerts: "hatch:chirpedAlerts", // milestone keys that already chirped (lib/chirp)
  draftRequest: "hatch:draftRequest", // storage.session: { tabId, url, at } the panel drafts on open (hint clicked)
} as const;

/**
 * noticeAuto: ask the AI whether a page is worth a hint, automatically. Only ever for stock pages and
 * tweets (never generic articles), once per page per session.
 */
export type Settings = {
  hiddenSites: string[];
  hiddenEverywhere: boolean;
  /** Master switch: off mutes every sound. */
  sounds: boolean;
  /** Double chirp on heads-ups (hint bubbles) and tracking alerts (80%, hatched, fees). */
  chirpAlerts: boolean;
  noticeAuto: boolean;
};
export const DEFAULT_SETTINGS: Settings = { hiddenSites: [], hiddenEverywhere: false, sounds: true, chirpAlerts: true, noticeAuto: true };

export type EggPos = { right: number; bottom: number };
export const DEFAULT_EGG_POS: EggPos = { right: 24, bottom: 24 };

export type HatchesCache = { wallet: string; at: number; list: HatchSummary[]; error?: string };

/** Per-mint flags so each milestone is announced once. */
export type Milestones = Record<string, { seen: boolean; almost: boolean; hatched: boolean; fees: boolean }>;

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const r = await browser.storage.local.get(key);
  return (r[key] as T | undefined) ?? fallback;
}

export function setLocal(key: string, value: unknown) {
  return browser.storage.local.set({ [key]: value });
}

/** Stored settings merged over the defaults (older installs have no `sounds` key: on). */
export const getSettings = async (): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...(await getLocal<Partial<Settings>>(KEYS.settings, {})) });

export function isHiddenOn(settings: Settings, hostname: string) {
  return settings.hiddenEverywhere || settings.hiddenSites.includes(hostname);
}

export async function updateSettings(patch: (s: Settings) => Settings) {
  await setLocal(KEYS.settings, patch(await getSettings()));
}

export function incubatingCount(list: HatchSummary[]) {
  return list.filter((h) => h.status !== "Hatched").length;
}
