// Server-only: Cloudflare R2 uploads (S3-compatible API).
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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

export function isR2Configured() {
  return r2Env() !== null;
}

let client: S3Client | null = null;

/** Uploads an object and returns its public URL. Throws R2NotConfiguredError if env is missing. */
export async function uploadToR2(key: string, body: Buffer | string, contentType: string): Promise<string> {
  const env = r2Env();
  if (!env) throw new R2NotConfiguredError();
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  try {
    await client.send(
      new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType })
    );
  } catch (e) {
    const code = (e as { Code?: string; name?: string })?.Code ?? (e as Error)?.name ?? 'UnknownError';
    throw new R2UploadError(`Upload to R2 failed (${code}) for ${key.split('/')[0]}`);
  }
  return `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
}
