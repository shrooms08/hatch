/**
 * When the double chirp may play for heads-ups and alerts. Pure (unit-tested); the background keeps the
 * state (heads-ups in storage.session, alerts in storage.local).
 *  - Heads-up (a hint bubble on a stock page, tweet or local news match): at most once per page URL per
 *    session, and at most once every 2 minutes overall.
 *  - Tracking alert (80%, hatched, fees claimable): at most once per token per milestone.
 */
export const HEADS_UP_GAP_MS = 2 * 60_000;
const MAX_REMEMBERED = 500;

export type HeadsUpState = { lastAt: number; urls: string[] };
export const EMPTY_HEADS_UP: HeadsUpState = { lastAt: 0, urls: [] };

const pageKey = (url: string) => url.split("#")[0]!;

export function headsUpChirp(state: HeadsUpState, url: string, now: number): { play: boolean; next: HeadsUpState } {
  const key = pageKey(url);
  if (state.urls.includes(key)) return { play: false, next: state };
  const urls = [...state.urls, key].slice(-MAX_REMEMBERED);
  if (now - state.lastAt < HEADS_UP_GAP_MS) return { play: false, next: { ...state, urls } };
  return { play: true, next: { lastAt: now, urls } };
}

export type AlertKind = "almost" | "hatched" | "fees";
export const alertKey = (mint: string, kind: AlertKind) => `${mint}:${kind}`;

/** Plays if any of these milestones hasn't chirped before; all of them are remembered. */
export function alertChirp(chirped: string[], keys: string[]): { play: boolean; next: string[] } {
  const fresh = keys.filter((k) => !chirped.includes(k));
  if (!fresh.length) return { play: false, next: chirped };
  return { play: true, next: [...chirped, ...fresh].slice(-MAX_REMEMBERED) };
}
