// Server-only: page images for the extension's draft card and the launch form, fetched by Hatch so
// extension CSP and hotlink blocking can't break them. Reuses safeFetch (SSRF-guarded: DNS resolved,
// private ranges refused, redirects re-checked) and serves only real image bytes up to 2 MB.
import { IMAGE_MAX_BYTES, sniffImageType, type ImageMimeType } from '@/lib/validation/launch';
import { safeFetchBytes } from '@/lib/server/safeFetch';

const MAX_URL = 2048;
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 64;
const cache = new Map<string, { at: number; bytes: Buffer; type: ImageMimeType }>();

/** An absolute http(s) URL without credentials, or null. */
export function proxyableUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_URL) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** PNG/JPG/WEBP/GIF by magic bytes, at most 2 MB; anything else is refused. */
export function imageTypeOf(bytes: Buffer): ImageMimeType | null {
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) return null;
  return sniffImageType(bytes);
}

export class NotAnImageError extends Error {}

export async function proxiedImage(url: string): Promise<{ bytes: Buffer; type: ImageMimeType }> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const bytes = await safeFetchBytes(url, IMAGE_MAX_BYTES);
  const type = imageTypeOf(bytes);
  if (!type) throw new NotAnImageError('Not a PNG, JPG, WEBP or GIF image');
  const entry = { at: Date.now(), bytes, type };
  cache.set(url, entry);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return entry;
}
