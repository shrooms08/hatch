import Head from 'next/head';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { Button } from '@/components/ui/button';
import { HatchList } from '@/components/Hatch/HatchList';
import { useHatchPools } from '@/hooks/useHatch';

export default function MyHatches() {
  const { publicKey } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const creator = publicKey?.toBase58();
  const { data, isLoading, error } = useHatchPools({ creator, enabled: !!creator });

  return (
    <Page>
      <Head>
        <title>My Hatches - Hatch</title>
      </Head>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Hatches</h1>
          <p className="text-neutral-400">Tokens you launched with Hatch, and the creator fees you can claim.</p>
        </div>
        {!creator ? (
          <div>
            <Button onClick={() => setShowModal(true)}>Connect wallet</Button>
          </div>
        ) : (
          <HatchList
            pools={data}
            isLoading={isLoading}
            error={error}
            showFees
            empty="You haven't hatched anything yet."
          />
        )}
      </div>
    </Page>
  );
}
