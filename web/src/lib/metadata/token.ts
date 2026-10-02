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

/** Keeps only the string fields we render; anything else in the JSON is ignored. */
export function pickMetadataJson(raw: unknown): TokenMetadataJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).slice(0, 2000) : undefined);
  const url = (k: string) => {
    const v = str(k);
    return v && /^https?:\/\//i.test(v) ? v : undefined;
  };
  return {
    name: str('name'),
    symbol: str('symbol'),
    description: str('description'),
    image: url('image'),
    external_url: url('external_url'),
  };
}

/**
 * Name/symbol/uri from chain only. The off-chain JSON is fetched server-side by
 * /api/token-metadata: metadata hosts (e.g. an R2 public bucket) usually send no CORS
 * headers, so a browser fetch of the JSON is blocked.
 */
export async function fetchOnChainMetadata(
  connection: Connection,
  mint: string
): Promise<Omit<HatchTokenMetadata, 'json'> | null> {
  const mintPk = new PublicKey(mint);
  const mintAccount = await connection.getAccountInfo(mintPk, 'confirmed');
  if (!mintAccount) return null;
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const md = await getTokenMetadata(connection, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return md ? { name: md.name, symbol: md.symbol, uri: md.uri } : null;
  }
  const account = await connection.getAccountInfo(deriveMintMetadata(mintPk), 'confirmed');
  return account ? parseMetaplex(account.data) : null;
}

/** Browser: token metadata (on-chain fields + off-chain JSON) via our API route. */
export async function fetchTokenMetadata(mint: string): Promise<HatchTokenMetadata | null> {
  const res = await fetch(`/api/token-metadata?mint=${encodeURIComponent(mint)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load token metadata (HTTP ${res.status})`);
  return (await res.json()) as HatchTokenMetadata;
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
