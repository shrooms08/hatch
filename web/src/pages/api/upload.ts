// POST /api/upload: validate a launch, store image + metadata JSON on R2, and return the
// UNSIGNED createPool transaction. The client signs and sends it with Phantom.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { launchRequestSchema, IMAGE_EXT } from '@/lib/validation/launch';
import { configKeyFor, PresetError } from '@/lib/server/presets';
import { isR2Configured, R2NotConfiguredError, R2UploadError, uploadToR2 } from '@/lib/server/r2';
import { ImageError, loadLaunchImage } from '@/lib/server/image';
import { buildCreatePoolTx } from '@/lib/server/createPool';

export const config = {
  api: { bodyParser: { sizeLimit: '3mb' } }, // 2 MB image as base64 (~2.7 MB) + fields
};

type Ok = { poolTx: string; pool: string; metadataUrl: string; imageUrl: string };
type Err = { error: string; issues?: Record<string, string[] | undefined> };

function parsePubkey(value: string, field: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new PresetError(`${field} is not a valid address`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = launchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid launch details', issues: parsed.error.flatten().fieldErrors });
  }
  const input = parsed.data;

  try {
    const configKey = configKeyFor(input.preset); // rejects presets not in POOL_CONFIGS
    const mint = parsePubkey(input.mint, 'mint');
    const user = parsePubkey(input.userWallet, 'userWallet');
    if (!isR2Configured()) throw new R2NotConfiguredError();

    const image = await loadLaunchImage(input.image);
    const mintId = mint.toBase58();
    const imageUrl = await uploadToR2(`images/${mintId}.${IMAGE_EXT[image.contentType]}`, image.bytes, image.contentType);

    const metadata = {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      image: imageUrl,
      ...(input.source ? { external_url: input.source } : {}),
      ...(input.website || input.twitter
        ? { extensions: { ...(input.website ? { website: input.website } : {}), ...(input.twitter ? { twitter: input.twitter } : {}) } }
        : {}),
      hatch: { preset: input.preset },
    };
    const metadataUrl = await uploadToR2(`metadata/${mintId}.json`, JSON.stringify(metadata), 'application/json');

    const connection = new Connection(serverRpcUrl(), 'confirmed');
    const { tx, pool } = await buildCreatePoolTx({
      connection,
      config: configKey,
      baseMint: mint,
      user,
      name: input.name,
      symbol: input.symbol,
      uri: metadataUrl,
    });

    return res.status(200).json({
      poolTx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      pool: pool.toBase58(),
      metadataUrl,
      imageUrl,
    });
  } catch (error) {
    if (error instanceof R2NotConfiguredError) return res.status(503).json({ error: 'R2 not configured' });
    if (error instanceof R2UploadError) return res.status(502).json({ error: error.message });
    if (error instanceof PresetError || error instanceof ImageError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('upload failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Failed to prepare the launch transaction' });
  }
}
