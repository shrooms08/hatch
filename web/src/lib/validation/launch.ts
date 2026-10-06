// Launch input rules, shared by the form (client) and /api/upload (server).
import { z } from 'zod';
import { PRESET_IDS } from '@/lib/presets';

export const NAME_MAX = 32;
export const SYMBOL_MAX = 10;
export const DESCRIPTION_MAX = 500;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

const httpUrl = z
  .string()
  .trim()
  .max(500, 'URL is too long')
  .url('Must be a valid URL')
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

export const launchFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`),
  symbol: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,10}$/, `Symbol must be 1-${SYMBOL_MAX} characters, A-Z and 0-9 only`),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`)
    .optional()
    .default(''),
  preset: z.enum(PRESET_IDS),
  /** STOCK only: ticker from the network's STOCK_CONFIGS (e.g. NVDA). */
  stock: z.string().trim().toUpperCase().max(8).optional().or(z.literal('')),
  source: httpUrl.optional().or(z.literal('')),
  website: httpUrl.optional().or(z.literal('')),
  twitter: httpUrl.optional().or(z.literal('')),
});

/** Server request body: fields + image (data URL from a file, or an http(s) URL from prefill). No image: the server makes one. */
export const launchRequestSchema = launchFieldsSchema.extend({
  image: z.string().optional().or(z.literal('')),
  mint: z.string().min(32).max(44),
  userWallet: z.string().min(32).max(44),
});

export type LaunchFields = z.infer<typeof launchFieldsSchema>;
export type LaunchRequest = z.infer<typeof launchRequestSchema>;

/** Detects the real image type from magic bytes (never trusts the declared type). */
export function sniffImageType(bytes: Uint8Array): ImageMimeType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return 'image/webp';
  return null;
}

export const IMAGE_EXT: Record<ImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
