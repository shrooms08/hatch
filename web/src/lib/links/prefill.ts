import { MAX_LINK_LENGTH } from './canonical';

/** ?u=<url> (from the extension's Hatch button): only a plain http(s) URL is taken; anything else is ignored. */
export function prefillUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u || u.length > MAX_LINK_LENGTH) return null;
  try {
    const parsed = new URL(u.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
