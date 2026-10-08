import { useState } from 'react';
import { TokenArt } from '@/components/ds/TokenArt';
import { useTokenMetadata } from '@/hooks/useHatch';
import { cn } from '@/lib/utils';

/** Token image from on-chain metadata; falls back to the generated egg art while loading or on error. */
export function TokenAvatar({
  mint,
  size = 52,
  paired,
  radius,
  className,
}: {
  mint: string;
  size?: number;
  paired?: string | null;
  radius?: number;
  className?: string;
}) {
  const { data: md } = useTokenMetadata(mint);
  const [broken, setBroken] = useState(false);
  const image = md?.json?.image;
  const r = radius ?? Math.round(size * 0.16);
  if (image && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn('shrink-0 bg-surface-2 object-cover', className)}
        style={{ width: size, height: size, borderRadius: r }}
      />
    );
  return <TokenArt ticker={md?.symbol ?? ''} seed={md?.symbol || mint} paired={paired} size={size} radius={r} className={className} />;
}
