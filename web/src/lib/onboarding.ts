// First-visit onboarding memory: localStorage, else sessionStorage, else a session cookie, else this tab's memory. Every access is
// wrapped: storage can throw (private mode, blocked site data) and onboarding must still show at most once.
const memory = new Set<string>();
const PREFIX = 'hatch.onboarding.';

export const WALKTHROUGH_KEY = 'walkthrough.v1';
export const tipKey = (id: string) => `tip.${id}.v1`;

function read(store: () => Storage, key: string): boolean | null {
  try {
    return store().getItem(PREFIX + key) === '1';
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string): boolean {
  try {
    store().setItem(PREFIX + key, '1');
    return true;
  } catch {
    return false;
  }
}

const cookieName = (key: string) => (PREFIX + key).replace(/[^A-Za-z0-9_.-]/g, '_');

function readCookie(key: string): boolean {
  try {
    return document.cookie.split('; ').includes(`${cookieName(key)}=1`);
  } catch {
    return false;
  }
}

function writeCookie(key: string) {
  try {
    // No expiry: a session cookie, so "at most once per session" holds even when storage is blocked.
    document.cookie = `${cookieName(key)}=1; path=/; SameSite=Lax`;
  } catch {
    /* memory only */
  }
}

export function hasSeen(key: string): boolean {
  if (memory.has(key)) return true;
  return !!(read(() => window.localStorage, key) || read(() => window.sessionStorage, key) || readCookie(key));
}

export function markSeen(key: string) {
  memory.add(key);
  if (!write(() => window.localStorage, key) && !write(() => window.sessionStorage, key)) writeCookie(key);
}
