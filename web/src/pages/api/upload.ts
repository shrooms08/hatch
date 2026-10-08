// POST /api/upload: validate a launch, store image + metadata JSON on R2, and return the
// UNSIGNED createPool transaction. The client signs and sends it with Phantom.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { launchRequestSchema, IMAGE_EXT } from '@/lib/validation/launch';
import { configKeyFor, PresetError } from '@/lib/server/presets';
import { isR2Configured, R2NotConfiguredError, R2ObjectExistsError, R2UploadError, uploadToR2 } from '@/lib/server/r2';
import { MintExistsError, assertMintIsNew } from '@/lib/server/launchGuards';
import { handleCors } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';
import { ImageError, loadLaunchImage } from '@/lib/server/image';
import { isFallbackUrl, renderFallbackPng } from '@/lib/server/fallbackImage';
import { loadHatchConfigs } from '@/lib/server/presets';
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
  if (handleCors(req, res, ['POST'])) return;

  const parsed = launchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid launch details', issues: parsed.error.flatten().fieldErrors });
  }
  const input = parsed.data;
  if (rateLimited(req, res, 'upload', 20)) return; // per IP per hour

  try {
    const configKey = configKeyFor(input.preset, input.stock); // rejects unknown presets and unlisted stocks
    const mint = parsePubkey(input.mint, 'mint');
    const user = parsePubkey(input.userWallet, 'userWallet');
    if (!isR2Configured()) throw new R2NotConfiguredError();
    const connection = new Connection(serverRpcUrl(), 'confirmed');
    await assertMintIsNew(connection, mint);

    const mintId = mint.toBase58();
    // No image (or a generated one from the extension's draft): render the Hatch egg for the final ticker.
    const pairedWith = input.preset === 'STOCK' && input.stock ? loadHatchConfigs().stocks[input.stock]?.symbol : null;
    const image =
      input.image && !isFallbackUrl(input.image)
        ? await loadLaunchImage(input.image)
        : { bytes: renderFallbackPng(input.symbol, pairedWith), contentType: 'image/png' as const };
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
      hatch: { preset: input.preset, ...(input.preset === 'STOCK' && input.stock ? { stock: input.stock } : {}) },
    };
    const metadataUrl = await uploadToR2(`metadata/${mintId}.json`, JSON.stringify(metadata), 'application/json');

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
    if (error instanceof MintExistsError || error instanceof R2ObjectExistsError) {
      return res.status(409).json({ error: 'This mint already has metadata. Launched tokens cannot be changed.' });
    }
    if (error instanceof R2UploadError) return res.status(502).json({ error: error.message });
    if (error instanceof PresetError || error instanceof ImageError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('upload failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Failed to prepare the launch transaction' });
  }
}
