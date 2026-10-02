import Head from 'next/head';
import Link from 'next/link';
import Explore from '@/components/Explore';
import Page from '@/components/ui/Page/Page';
import { HatchList } from '@/components/Hatch/HatchList';
import { buttonVariants } from '@/components/ui/button';
import { useHatchPools } from '@/hooks/useHatch';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';

/** Chain-only home: every pool under Hatch's preset configs. */
function HatchHome() {
  const { data, isLoading, error } = useHatchPools();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hatches</h1>
          <p className="text-neutral-400">Tokens launched with Hatch, read live from Meteora DBC.</p>
        </div>
        <Link href="/launch" className={buttonVariants()}>
          Hatch a token
        </Link>
      </div>
      <HatchList pools={data} isLoading={isLoading} error={error} empty="No hatches yet. Be the first!" />
    </div>
  );
}

export default function Index() {
  return (
    <Page>
      <Head>
        <title>Hatch</title>
      </Head>
      {ENABLE_JUPITER_DATA ? <Explore /> : <HatchHome />}
    </Page>
  );
}
