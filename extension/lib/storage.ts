/** browser.storage keys and typed helpers. No keys, wallets' secrets or API keys are ever stored. */
import { browser } from "wxt/browser";
import type { HatchSummary } from "./types";

export const KEYS = {
  settings: "hatch:settings",
  eggPos: "hatch:eggPos",
  wallet: "hatch:wallet", // public address only
  hatches: "hatch:hatches",
  milestones: "hatch:milestones",
  noticed: "hatch:noticed", // storage.session: url -> hint | null
} as const;

export type Settings = { hiddenSites: string[]; hiddenEverywhere: boolean };
export const DEFAULT_SETTINGS: Settings = { hiddenSites: [], hiddenEverywhere: false };

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

export const getSettings = () => getLocal<Settings>(KEYS.settings, DEFAULT_SETTINGS);

export function isHiddenOn(settings: Settings, hostname: string) {
  return settings.hiddenEverywhere || settings.hiddenSites.includes(hostname);
}

export async function updateSettings(patch: (s: Settings) => Settings) {
  await setLocal(KEYS.settings, patch(await getSettings()));
}

export function incubatingCount(list: HatchSummary[]) {
  return list.filter((h) => h.status !== "Hatched").length;
}
