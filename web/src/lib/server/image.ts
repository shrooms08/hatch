// Server-only: turn a launch image (data URL from a file, or an http(s) URL from prefill)
// into validated bytes. Only png/jpg/webp/gif up to 2 MB, verified by magic bytes.
import { IMAGE_MAX_BYTES, sniffImageType, type ImageMimeType } from '@/lib/validation/launch';

export class ImageError extends Error {}

const FETCH_TIMEOUT_MS = 10_000;

function isPrivateHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '[::1]'
  );
}

function checkedUrl(url: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    throw new ImageError('Image URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ImageError('Image URL must be http(s)');
  if (isPrivateHost(parsed.hostname)) throw new ImageError('Image URL host is not allowed');
  return parsed;
}

const MAX_REDIRECTS = 3;

async function fetchRemote(url: string): Promise<Buffer> {
  // Follow redirects by hand so every hop is checked against private hosts.
  let target = checkedUrl(url);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => {
      throw new ImageError('Could not download the image URL');
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      target = checkedUrl(location, target);
      continue;
    }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400)) throw new ImageError('Image URL redirects too many times');
  if (!res.ok || !res.body) throw new ImageError(`Image URL returned HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > IMAGE_MAX_BYTES) throw new ImageError('Image is larger than 2 MB');

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > IMAGE_MAX_BYTES) {
      await reader.cancel();
      throw new ImageError('Image is larger than 2 MB');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
  if (!match) throw new ImageError('Image must be a base64 data URL');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > IMAGE_MAX_BYTES) throw new ImageError('Image is larger than 2 MB');
  return bytes;
}

export async function loadLaunchImage(image: string): Promise<{ bytes: Buffer; contentType: ImageMimeType }> {
  const bytes = image.startsWith('data:') ? decodeDataUrl(image) : await fetchRemote(image);
  if (bytes.length === 0) throw new ImageError('Image is empty');
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new ImageError('Image must be PNG, JPG, WEBP or GIF');
  return { bytes, contentType };
}
