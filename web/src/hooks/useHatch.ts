// React Query hooks for Hatch chain data. All reads go straight to RPC via the DBC SDK.
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/connection';
import { fetchHatchPoolByMint, fetchHatchPools } from '@/lib/dbc/pool';
import { fetchTokenMetadata } from '@/lib/metadata/token';
import { fetchMintInfo, fetchRawBalance, rawToUi, type MintInfo } from '@/lib/solana/mint';
import type { PresetConfigMap } from '@/lib/presets';
import type { PresetsResponse } from '@/pages/api/presets';

const POLL_MS = 10_000;

export function usePresetConfigs() {
  return useQuery({
    queryKey: ['hatch', 'presets'],
    queryFn: async (): Promise<PresetConfigMap> => {
      const res = await fetch('/api/presets');
      if (!res.ok) throw new Error('Could not load presets');
      return ((await res.json()) as PresetsResponse).configs;
    },
    staleTime: 60_000,
  });
}

export function useHatchPool(baseMint: string | undefined) {
  const { data: configs } = usePresetConfigs();
  return useQuery({
    queryKey: ['hatch', 'pool', baseMint, configs],
    queryFn: () => fetchHatchPoolByMint(getConnection(), baseMint!, configs ?? {}),
    enabled: !!baseMint && !!configs,
    refetchInterval: POLL_MS,
  });
}

export function useHatchPools(opts: { creator?: string; enabled?: boolean } = {}) {
  const { data: configs } = usePresetConfigs();
  return useQuery({
    queryKey: ['hatch', 'pools', opts.creator ?? 'all', configs],
    queryFn: () => fetchHatchPools(getConnection(), configs ?? {}, { creator: opts.creator }),
    enabled: !!configs && opts.enabled !== false,
    refetchInterval: 30_000,
  });
}

export function useTokenMetadata(mint: string | undefined) {
  return useQuery({
    queryKey: ['hatch', 'metadata', mint],
    queryFn: () => fetchTokenMetadata(getConnection(), mint!),
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
