// React Query hooks for Hatch chain data. All reads go straight to RPC via the DBC SDK.
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/connection';
import { dbcClient, fetchHatchPoolByMint, fetchHatchPools } from '@/lib/dbc/pool';
import { fetchTokenMetadata } from '@/lib/metadata/token';
import { fetchMintInfo, fetchRawBalance, rawToUi, type MintInfo } from '@/lib/solana/mint';
import type { HatchConfigs } from '@/lib/presets';
import type { PresetsResponse } from '@/pages/api/presets';

const POLL_MS = 10_000;

/** Base mint from /token/[tokenId], or undefined until the router is ready (no default mint). */
export function useRouteMint(): string | undefined {
  const { isReady, query } = useRouter();
  if (!isReady) return undefined;
  const id = Array.isArray(query.tokenId) ? query.tokenId[0] : query.tokenId;
  return id || undefined;
}

export function usePresetConfigs() {
  return useQuery({
    queryKey: ['hatch', 'presets'],
    queryFn: async (): Promise<HatchConfigs> => {
      const res = await fetch('/api/presets');
      if (!res.ok) throw new Error('Could not load presets');
      const body = (await res.json()) as PresetsResponse;
      return { network: body.network, configs: body.configs, stocks: body.stocks, hiddenMints: body.hiddenMints, testMints: body.testMints ?? [] };
    },
    staleTime: 60_000,
  });
}

export function useHatchPool(baseMint: string | undefined) {
  const { data: configs } = usePresetConfigs();
  return useQuery({
    queryKey: ['hatch', 'pool', baseMint, configs],
    queryFn: () => fetchHatchPoolByMint(getConnection(), baseMint!, configs!),
    enabled: !!baseMint && !!configs,
    refetchInterval: POLL_MS,
  });
}

export function useHatchPools(opts: { creator?: string; enabled?: boolean } = {}) {
  const { data: configs } = usePresetConfigs();
  return useQuery({
    queryKey: ['hatch', 'pools', opts.creator ?? 'all', configs],
    queryFn: () => fetchHatchPools(getConnection(), configs!, { creator: opts.creator, publicList: !opts.creator }),
    enabled: !!configs && opts.enabled !== false,
    refetchInterval: 30_000,
  });
}

export function useTokenMetadata(mint: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'metadata', mint],
    queryFn: () => fetchTokenMetadata(mint!),
    enabled: !!mint,
    staleTime: 5 * 60_000,
  });
}

/** Display symbol for a quote mint: SOL for wrapped SOL, else on-chain metadata symbol. */
export function useQuoteSymbol(quote: Pick<MintInfo, 'address' | 'isNativeSol'> | undefined): string {
  const { data } = useTokenMetadata(quote && !quote.isNativeSol ? quote.address : undefined);
  if (!quote) return '';
  if (quote.isNativeSol) return 'SOL';
  return data?.symbol || `${quote.address.slice(0, 4)}…`;
}

/** UI balance of `mint` held by `owner` (scaled multiplier applied; native SOL for wSOL). */
export function useTokenBalance(owner: PublicKey | null | undefined, mint: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'balance', owner?.toBase58(), mint],
    queryFn: async () => {
      const connection = getConnection();
      const info = await fetchMintInfo(connection, mint!);
      return rawToUi(await fetchRawBalance(connection, owner!, info), info);
    },
    enabled: !!owner && !!mint,
    refetchInterval: POLL_MS,
  });
}

/** Home live stats + pool creation times (GET /api/stats, cached 60s server-side). */
export function useHatchStats() {
  return useQuery({
    queryKey: ['hatch', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Could not load stats');
      return (await res.json()) as import('@/lib/server/stats').HatchStats;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Number of holders of a base mint (GET /api/holders, cached 60s server-side). */
export function useHolders(mint: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'holders', mint],
    queryFn: async () => {
      const res = await fetch(`/api/holders?mint=${mint}`);
      if (!res.ok) throw new Error('holders unavailable');
      return ((await res.json()) as { holders: number }).holders;
    },
    enabled: !!mint,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** USD price of a mint from Jupiter's price API (mainnet only; null when unknown). */
export function useUsdPrice(mint: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'usd-price', mint],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_JUPITER_API_URL || 'https://lite-api.jup.ag';
      const res = await fetch(`${base}/price/v3?ids=${mint}`);
      if (!res.ok) return null;
      const body = (await res.json()) as Record<string, { usdPrice?: number } | null>;
      return body[mint!]?.usdPrice ?? null;
    },
    enabled: !!mint && process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta',
    staleTime: 60_000,
    retry: false,
  });
}

/** A launch config's hatch goal (migration threshold) in UI units of its quote token. */
export function useConfigThreshold(configKey: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'config-threshold', configKey],
    queryFn: async () => {
      const connection = getConnection();
      const config = await dbcClient(connection).state.getPoolConfig(configKey!);
      if (!config) return null;
      const quote = await fetchMintInfo(connection, config.quoteMint);
      return rawToUi(config.migrationQuoteThreshold, quote);
    },
    enabled: !!configKey,
    staleTime: 10 * 60_000,
  });
}

/** True when `mint` is a test launch (TEST_MINTS). */
export function useIsTestLaunch(mint: string | undefined) {
  const { data } = usePresetConfigs();
  return !!mint && !!data?.testMints.includes(mint);
}
