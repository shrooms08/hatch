// Browser side of a launch: prepare via /api/upload, then Phantom signs and sends.
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import type { WalletContextState } from '@jup-ag/wallet-adapter';
import { signAndSend } from '@/lib/dbc/transactions';
import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES, type LaunchFields } from '@/lib/validation/launch';

export function checkImageFile(file: File): string | null {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'Image must be PNG, JPG, WEBP or GIF';
  if (file.size > IMAGE_MAX_BYTES) return 'Image must be 2 MB or smaller';
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image file'));
    reader.readAsDataURL(file);
  });
}

export async function launchToken(params: {
  wallet: Pick<WalletContextState, 'publicKey' | 'sendTransaction'>;
  connection: Connection;
  fields: LaunchFields;
  /** Uploaded file, or an http(s) image URL (prefill). */
  image: File | string;
}): Promise<{ signature: string; mint: string; pool: string }> {
  const { wallet, connection, fields } = params;
  if (!wallet.publicKey) throw new Error('Connect your wallet first');

  let image: string;
  if (typeof params.image === 'string') {
    image = params.image;
  } else {
    const problem = checkImageFile(params.image);
    if (problem) throw new Error(problem);
    image = await readAsDataUrl(params.image);
  }

  const mintKeypair = Keypair.generate();
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fields,
      image,
      mint: mintKeypair.publicKey.toBase58(),
      userWallet: wallet.publicKey.toBase58(),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = body.issues ? Object.values(body.issues).flat().join(', ') : '';
    throw new Error(issues || body.error || `Upload failed (HTTP ${res.status})`);
  }

  if (!body.poolTx || !body.imageUrl || !body.metadataUrl) {
    throw new Error('Image or metadata upload did not complete; nothing was launched. Please try again.');
  }
  const tx = Transaction.from(Buffer.from(body.poolTx, 'base64'));
  const signature = await signAndSend(wallet, connection, tx, [mintKeypair]);
  return { signature, mint: mintKeypair.publicKey.toBase58(), pool: body.pool };
}
