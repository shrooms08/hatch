// React Query hooks for Hatch chain data. All reads go straight to RPC via the DBC SDK.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useRouter } from 'next/router';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { perByteFromRent0 } from '@/lib/costs';
import { getConnection } from '@/lib/solana/connection';
import { cachedMintInfo, cachedPoolConfig, dbcClient, describePool, fetchHatchPoolByMint, fetchHatchPools, type HatchPool } from '@/lib/dbc/pool';
import { baseFeePercentAt, feeScheduleOf, hasSniperShield, shieldDuration, shieldRange } from '@/lib/dbc/feeSchedule';
import { fetchTokenMetadata } from '@/lib/metadata/token';
import { fetchMintInfo, fetchRawBalance, rawToUi, type MintInfo } from '@/lib/solana/mint';
import type { HatchConfigs } from '@/lib/presets';
import type { PresetsResponse } from '@/pages/api/presets';
import type { PoolsResponse } from '@/pages/api/pools';
import { poolFromJson } from '@/lib/dbc/poolJson';
import type { HoldingsResponse } from '@/pages/api/holdings';
import type { ShieldReceipt } from '@/lib/server/shield';
import type { MyLinkHatch } from '@/lib/server/links/service';

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
    queryFn: async (): Promise<HatchConfigs & { copy: PresetsResponse['copy'] }> => {
      const res = await fetch('/api/presets');
      if (!res.ok) throw new Error('Could not load presets');
      const body = (await res.json()) as PresetsResponse;
      return {
        network: body.network,
        configs: body.configs,
        stocks: body.stocks,
        hiddenMints: body.hiddenMints,
        testMints: body.testMints ?? [],
        legacy: body.legacy ?? [],
        link: body.link ?? null,
        copy: body.copy ?? {},
      };
    },
    staleTime: 60_000,
  });
}

/** Where a pool lives (address + config), found once per mint per session. */
const poolRefs = new Map<string, { address: string; configKey: string }>();

/** The public pool list from the cached server route (shared with the home page's query). */
export async function fetchPublicPools(): Promise<HatchPool[]> {
  const res = await fetch('/api/pools');
  if (!res.ok) throw new Error('Could not load hatches right now');
  return ((await res.json()) as PoolsResponse).pools.map(poolFromJson);
}

/**
 * A token page's pool, refreshed every 10 s with ONE RPC call (the pool account). Its address and config
 * come from the cached /api/pools list (no RPC) and a once-per-session config read; a pool missing from
 * the list (brand new, or hidden) falls back to the per-config lookup once.
 */
export function useHatchPool(baseMint: string | undefined) {
  const { data: configs } = usePresetConfigs();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['hatch', 'pool', baseMint, configs],
    queryFn: async (): Promise<HatchPool | null> => {
      const connection = getConnection();
      const mint = baseMint!;
      let ref = poolRefs.get(mint);
      if (!ref) {
        const list = await queryClient.fetchQuery(['hatch', 'pools', 'all'], fetchPublicPools, { staleTime: 30_000 }).catch((): HatchPool[] => []);
        const listed = list.find((p) => p.baseMint === mint);
        if (!listed) {
          const pool = await fetchHatchPoolByMint(connection, mint, configs!);
          if (pool) poolRefs.set(mint, { address: pool.address, configKey: pool.configKey });
          return pool;
        }
        ref = { address: listed.address, configKey: listed.configKey };
        poolRefs.set(mint, ref);
      }
      const [config, state] = await Promise.all([cachedPoolConfig(connection, ref.configKey), dbcClient(connection).state.getPool(ref.address)]);
      if (!config || !state) {
        poolRefs.delete(mint);
        return fetchHatchPoolByMint(connection, mint, configs!);
      }
      return describePool(connection, new PublicKey(ref.address), state, config, configs!);
    },
    enabled: !!baseMint && !!configs,
    refetchInterval: POLL_MS,
  });
}

export function useHatchPools(opts: { creator?: string; enabled?: boolean } = {}) {
  const { data: configs } = usePresetConfigs();
  return useQuery({
    queryKey: opts.creator ? ['hatch', 'pools', opts.creator, configs] : ['hatch', 'pools', 'all'],
    queryFn: async () => {
      if (opts.creator) return fetchHatchPools(getConnection(), configs!, { creator: opts.creator });
      // Public list: from the cached server route (no getProgramAccounts from the browser).
      return fetchPublicPools();
    },
    enabled: (!!configs || !opts.creator) && opts.enabled !== false,
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
      const info = await cachedMintInfo(connection, mint!); // static: read once, not every 10 s
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
    retry: 1, // a count that cannot load shows "n/a" instead of waiting through retries
  });
}

/**
 * The sniper receipt (what buys in the anti-sniper window paid), from /api/shield. Fetched only once the
 * window has ended (`enabled`); polled every 10 s until the server marks it final, then never again.
 */
export function useShieldReceipt(pool: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['hatch', 'shield', pool],
    queryFn: async () => {
      const res = await fetch(`/api/shield/${pool}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('shield receipt unavailable');
      return (await res.json()) as ShieldReceipt;
    },
    enabled: !!pool && enabled,
    staleTime: 10_000,
    refetchInterval: (data) => (data === null || data?.final ? false : 10_000),
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

/** Configs (by key) whose base fee decays: the Sniper shield. Used on the launch form's preset cards. */
export function useShieldedConfigs(configKeys: string[]) {
  const keys = [...new Set(configKeys.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['hatch', 'config-shield', keys],
    queryFn: async () => {
      const dbc = dbcClient(getConnection());
      const shielded = await Promise.all(
        keys.map(async (k): Promise<string | null> => {
          const config = await dbc.state.getPoolConfig(k).catch((): null => null);
          return config && hasSniperShield(feeScheduleOf(config)) ? k : null;
        })
      );
      return new Set(shielded.filter((k): k is string => !!k));
    },
    enabled: keys.length > 0,
    staleTime: 30 * 60_000,
  });
}

/**
 * The pool's base fee now (%), ticking every second while the Sniper shield decays.
 * `shield` is null for flat-fee pools; `decaying` is true until the final fee is reached.
 */
export function useLiveBaseFee(pool: HatchPool | null | undefined) {
  const f = pool?.feeSchedule;
  const shield = hasSniperShield(f) && f.activationType === 1 ? f : null; // Hatch configs activate by timestamp
  const end = shield ? Number(pool!.activationPoint) + shieldDuration(shield) : 0;
  const [now, setNow] = useState(() => Date.now() / 1000);
  const decaying = !!shield && now < end;
  useEffect(() => {
    if (!decaying) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [decaying]);
  if (!pool || !f) return null;
  if (!shield) return { percent: hasSniperShield(f) ? shieldRange(f).end : baseFeePercentAt(f, '0', 0), shield: null, decaying: false, secondsLeft: 0 };
  return { percent: baseFeePercentAt(shield, pool.activationPoint, now), shield: shieldRange(shield), decaying, secondsLeft: Math.max(0, Math.ceil(end - now)) };
}

/** Lamports per byte of rent-exempt storage (rent(0) / 128). One RPC call per session. */
export function useRentPerByte() {
  return useQuery({
    queryKey: ['hatch', 'rent-per-byte'],
    queryFn: async () => perByteFromRent0(await getConnection().getMinimumBalanceForRentExemption(0)),
    staleTime: Infinity,
  });
}

/** The wallet's SOL balance in lamports. */
export function useSolLamports(owner: PublicKey | null | undefined) {
  return useQuery({
    queryKey: ['hatch', 'sol-lamports', owner?.toBase58()],
    queryFn: () => getConnection().getBalance(owner!, 'confirmed'),
    enabled: !!owner,
    refetchInterval: POLL_MS,
  });
}

/** Whether `owner` already has the associated token account for `mint` (no rent needed to buy). */
export function useHasTokenAccount(owner: PublicKey | null | undefined, mint: MintInfo | string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'has-ata', owner?.toBase58(), typeof mint === 'string' ? mint : mint?.address],
    queryFn: async () => {
      const connection = getConnection();
      const info = typeof mint === 'string' ? await cachedMintInfo(connection, mint) : mint!;
      const ata = getAssociatedTokenAddressSync(new PublicKey(info.address), owner!, true, new PublicKey(info.programId));
      return !!(await connection.getAccountInfo(ata, 'confirmed'));
    },
    enabled: !!owner && !!mint,
    refetchInterval: 60_000, // trades invalidate it right away; otherwise it rarely changes
  });
}

/**
 * Link coins the wallet hatched (GET /api/links/hatched). Their on-chain creator is the Hatch vault, so the creator
 * scan never finds them. Empty where link coins are off (the route answers 404 there).
 */
export function useMyLinkHatches(wallet: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'link-hatches', wallet],
    queryFn: async (): Promise<MyLinkHatch[]> => {
      const res = await fetch(`/api/links/hatched?wallet=${encodeURIComponent(wallet!)}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Could not read your link coins');
      return ((await res.json()) as { hatches: MyLinkHatch[] }).hatches;
    },
    enabled: !!wallet,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/** Hatch tokens the wallet holds (GET /api/holdings: chain read + Jupiter USD estimates). */
export function useHoldings(wallet: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'holdings', wallet],
    queryFn: async () => {
      const res = await fetch(`/api/holdings?wallet=${wallet}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not read holdings');
      return (body as HoldingsResponse).holdings;
    },
    enabled: !!wallet,
    refetchInterval: 30_000,
  });
}

/** Total supply of a mint in UI units: one read per page (supply of a launched token doesn't move). */
export function useMintSupply(mint: string | undefined, decimals: number | undefined) {
  return useQuery({
    queryKey: ['hatch', 'supply', mint],
    queryFn: async () => {
      const info = await getConnection().getAccountInfo(new PublicKey(mint!), 'confirmed');
      if (!info || info.data.length < 44) return null;
      // SPL and Token-2022 mints share the base layout: supply is the u64 at offset 36.
      const raw = new DataView(info.data.buffer, info.data.byteOffset + 36, 8).getBigUint64(0, true);
      return new Decimal(raw.toString()).div(new Decimal(10).pow(decimals!));
    },
    enabled: !!mint && decimals !== undefined,
    staleTime: 10 * 60_000,
  });
}

/** True when `mint` is a test launch (TEST_MINTS). */
export function useIsTestLaunch(mint: string | undefined) {
  const { data } = usePresetConfigs();
  return !!mint && !!data?.testMints.includes(mint);
}
