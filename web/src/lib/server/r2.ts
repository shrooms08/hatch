// Server-only: Cloudflare R2 uploads (S3-compatible API).
// Devnet uploads live under devnet/ (images, metadata, receipts...); mainnet keys are unchanged.
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NETWORK, type SolanaNetwork } from '@/lib/config/network';

/** The bucket key for `key` on `network`: devnet/<key> on devnet, <key> on mainnet. */
export function r2ObjectKey(key: string, network: SolanaNetwork = NETWORK): string {
  const k = key.replace(/^\/+/, '');
  return network === 'devnet' ? `devnet/${k}` : k;
}

export class R2NotConfiguredError extends Error {
  constructor() {
    super('R2 not configured');
  }
}

function r2Env() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET || !R2_PUBLIC_URL) {
    return null;
  }
  return { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_URL };
}

/** R2 rejected or failed an upload. Message carries only the S3 error code. */
export class R2UploadError extends Error {}

/** The key already exists: objects are write-once (IfNoneMatch: '*'), never replaced. */
export class R2ObjectExistsError extends Error {}

/** Every upload is create-only: R2 refuses the PUT (412) if an object already exists at `key`. */
export function putObjectCommand(bucket: string, key: string, body: Buffer | string, contentType: string) {
  return new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: '*' });
}

export function isR2Configured() {
  return r2Env() !== null;
}

let client: S3Client | null = null;

/** Uploads a NEW object and returns its public URL. Throws R2NotConfiguredError if env is missing, R2ObjectExistsError if the key is taken. */
export async function uploadToR2(logicalKey: string, body: Buffer | string, contentType: string): Promise<string> {
  const key = r2ObjectKey(logicalKey);
  const env = r2Env();
  if (!env) throw new R2NotConfiguredError();
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  try {
    await client.send(putObjectCommand(env.R2_BUCKET, key, body, contentType));
  } catch (e) {
    const code = (e as { Code?: string; name?: string })?.Code ?? (e as Error)?.name ?? 'UnknownError';
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 412 || code === 'PreconditionFailed') throw new R2ObjectExistsError(`${logicalKey.split('/')[0]} object already exists`);
    throw new R2UploadError(`Upload to R2 failed (${code}) for ${logicalKey.split('/')[0]}`);
  }
  return `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
}

/** Public URL of an object key (no upload). */
export function publicR2Url(logicalKey: string): string {
  const env = r2Env();
  if (!env) throw new R2NotConfiguredError();
  return `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${r2ObjectKey(logicalKey)}`;
}
