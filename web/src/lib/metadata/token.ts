// Token metadata from chain: Metaplex metadata account (SPL base mints, which DBC creates for
// tokenType SPL) or the Token-2022 metadata extension, then the off-chain JSON at `uri`.
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from '@solana/spl-token';
import { deriveMintMetadata } from '@meteora-ag/dynamic-bonding-curve-sdk';

export type TokenMetadataJson = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  external_url?: string;
};

export type HatchTokenMetadata = {
  name: string;
  symbol: string;
  uri: string;
  json: TokenMetadataJson | null;
};

function readBorshString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const value = buf.subarray(offset + 4, offset + 4 + len).toString('utf8').replace(/\0/g, '').trim();
  return [value, offset + 4 + len];
}

/** Parses name/symbol/uri from a Metaplex Token Metadata account (key, update auth, mint, data). */
function parseMetaplex(data: Buffer) {
  const [name, o1] = readBorshString(data, 1 + 32 + 32);
  const [symbol, o2] = readBorshString(data, o1);
  const [uri] = readBorshString(data, o2);
  return { name, symbol, uri };
}

async function fetchJson(uri: string): Promise<TokenMetadataJson | null> {
  if (!/^https?:\/\//i.test(uri)) return null;
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as TokenMetadataJson;
  } catch {
    return null;
  }
}

export async function fetchTokenMetadata(
  connection: Connection,
  mint: string
): Promise<HatchTokenMetadata | null> {
  const mintPk = new PublicKey(mint);
  const mintAccount = await connection.getAccountInfo(mintPk, 'confirmed');
  if (!mintAccount) return null;

  let base: { name: string; symbol: string; uri: string } | null = null;
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const md = await getTokenMetadata(connection, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (md) base = { name: md.name, symbol: md.symbol, uri: md.uri };
  } else {
    const account = await connection.getAccountInfo(deriveMintMetadata(mintPk), 'confirmed');
    if (account) base = parseMetaplex(account.data);
  }
  if (!base) return null;
  return { ...base, json: await fetchJson(base.uri) };
}

/** "https://x.com/foo/status/1" -> "x.com" */
export function sourceDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
