import { useTokenMetadata } from '@/hooks/useHatch';
import { sourceDomain } from '@/lib/metadata/token';
import { PRESETS, type PresetId } from '@/lib/presets';
import { explorerAddressUrl } from '@/lib/config/network';
import { shortenAddress } from '@/lib/utils';

export function HatchTokenHeader({ mint, presetId }: { mint: string; presetId: PresetId | null }) {
  const { data: md, isLoading } = useTokenMetadata(mint);
  const json = md?.json;
  const domain = sourceDomain(json?.external_url);

  return (
    <div className="flex w-full items-start gap-4">
      {json?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={json.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-lg bg-neutral-850" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold">{md?.name || (isLoading ? '…' : 'Unknown token')}</h1>
          {md?.symbol && <span className="text-neutral-400">${md.symbol}</span>}
          {presetId && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300">
              {PRESETS[presetId].label}
            </span>
          )}
        </div>
        <a
          href={explorerAddressUrl(mint)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          {shortenAddress(mint)}
        </a>
        {json?.description && <p className="mt-2 text-sm text-neutral-300">{json.description}</p>}
        {domain && (
          <p className="mt-2 text-sm text-neutral-400">
            Inspired by{' '}
            <a href={json!.external_url} target="_blank" rel="noreferrer nofollow" className="text-primary hover:underline">
              {domain}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
