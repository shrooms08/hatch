// Server-only: turn a launch image (data URL from a file, or an http(s) URL from prefill)
// into validated bytes. Only png/jpg/webp/gif up to 2 MB, verified by magic bytes.
import { IMAGE_MAX_BYTES, sniffImageType, type ImageMimeType } from '@/lib/validation/launch';
import { SafeFetchError, safeFetchBytes } from '@/lib/server/safeFetch';

export class ImageError extends Error {}

async function fetchRemote(url: string): Promise<Buffer> {
  try {
    return await safeFetchBytes(url, IMAGE_MAX_BYTES);
  } catch (e) {
    if (e instanceof SafeFetchError) throw new ImageError(`Image URL: ${e.message}`);
    throw e;
  }
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
