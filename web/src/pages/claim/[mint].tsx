// /claim/<mint>: the link's owner verifies (GitHub in P4a), then claims the coin to their wallet or disowns it and
// sends the held fees to a wallet they choose. Hatch's approver reviews every request; Hatch pays every fee.
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { Button, Card } from '@/components/ds';
import { HELD_BY_VAULT, formatSol, lamportsToSol, shortWallet } from '@/lib/links/claimShared';
import { explorerTxUrl } from '@/lib/config/network';
import { PLATFORM_NAME } from '@/lib/links/listing';

type Info = {
  mint: string;
  canonicalId: string;
  displayUrl: string;
  title: string | null;
  coinName: string | null;
  ticker: string | null;
  owner: { platform: string | null; handle: string | null };
  status: 'hatched' | 'claimed' | 'disowned';
  claimedWallet: string | null;
  heldLamports: string;
  phase: 'curve' | 'gap' | 'migrated';
  canVerify: boolean;
  platform: 'github' | null;
  verified: { platform: string; login: string; accountId: string; verifiedAt: string } | null;
  openClaim: { id: string; status: string; action: 'claim' | 'disown'; destination: string; createdAt: string } | null;
  lastClaim: { action: 'claim' | 'disown'; destination: string; executeSignature: string | null; receivedLamports: number | null } | null;
};

export const getServerSideProps: GetServerSideProps = async () => {
  const { linkNetwork } = await import('@/lib/server/links/chain');
  const { isVaultConfigured } = await import('@/lib/server/links/squads');
  return linkNetwork() && isVaultConfigured() ? { props: {} } : { notFound: true };
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function ClaimPage() {
  const router = useRouter();
  const mint = typeof router.query.mint === 'string' ? router.query.mint : '';
  const qc = useQueryClient();
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const info = useQuery({ queryKey: ['claim', mint], queryFn: () => getJson<Info>(`/api/links/claim/info?mint=${encodeURIComponent(mint)}`), enabled: !!mint, refetchInterval: 20_000 });
  const [action, setAction] = useState<'claim' | 'disown'>('claim');
  const [other, setOther] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlError = typeof router.query.error === 'string' ? router.query.error : null;

  const d = info.data;
  const destination = action === 'claim' ? wallet.publicKey?.toBase58() ?? '' : other.trim();
  const held = lamportsToSol(d?.heldLamports);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await getJson('/api/links/claim/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint, action, destination }) });
      setConfirming(false);
      await qc.invalidateQueries(['claim', mint]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Claim a link coin - Hatch</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <h1 className="font-display text-3xl font-bold text-ink">Claim your link&apos;s coin</h1>
        {info.isLoading && <Card className="rounded-[20px] p-5 text-sm text-ink-2">Loading…</Card>}
        {info.error && <Card className="rounded-[20px] p-5 text-sm text-danger">{(info.error as Error).message}</Card>}
        {d && (
          <>
            <Card className="flex flex-col gap-2 rounded-[20px] p-5 text-sm text-ink-2">
              <div className="text-lg font-semibold text-ink">
                {d.coinName ?? 'Link coin'} {d.ticker && <span className="font-mono text-ink-muted">${d.ticker}</span>}
              </div>
              <div>
                Coin for:{' '}
                <a className="break-all font-mono text-ink-accent" href={d.displayUrl} target="_blank" rel="noreferrer noopener">
                  {d.displayUrl}
                </a>
              </div>
              {d.owner.handle && (
                <div>
                  Owner: <span className="text-ink">{d.owner.handle}</span>{' '}
                  {d.owner.platform && d.owner.platform !== 'web' && <span className="text-ink-muted">on {PLATFORM_NAME[d.owner.platform as keyof typeof PLATFORM_NAME] ?? d.owner.platform}</span>}
                </div>
              )}
              {d.status === 'hatched' && (
                <div>
                  Creator fees waiting: <span className="font-mono text-ink">{formatSol(held)}</span> <span className="text-ink-muted">({HELD_BY_VAULT})</span>
                </div>
              )}
              <Link className="self-start text-ink-accent" href={`/token/${d.mint}`}>
                View the coin
              </Link>
            </Card>

            {d.status !== 'hatched' ? (
              <Card className="flex flex-col gap-2 rounded-[20px] p-5 text-sm">
                <span className="font-semibold text-ink">{d.status === 'claimed' ? 'Claimed by its owner' : 'Disowned by owner'}</span>
                <span className="text-ink-2">
                  {d.status === 'claimed' ? 'Fees go to the owner’s wallet' : 'Fees go to the wallet the owner chose'}: <span className="font-mono">{shortWallet(d.claimedWallet)}</span>
                </span>
                {d.lastClaim?.executeSignature && (
                  <a className="text-ink-accent" href={explorerTxUrl(d.lastClaim.executeSignature)} target="_blank" rel="noreferrer">
                    Handover transaction
                  </a>
                )}
              </Card>
            ) : d.openClaim ? (
              <Card className="flex flex-col gap-2 rounded-[20px] p-5 text-sm">
                <span className="font-semibold text-ink">Waiting for Hatch&apos;s approval</span>
                <span className="text-ink-2">
                  {d.openClaim.action === 'claim' ? 'Claim to' : 'Disown, held fees to'} <span className="font-mono">{d.openClaim.destination}</span>
                </span>
                <span className="text-xs text-ink-muted">The wallet can&apos;t be changed now. To use another one, ask Hatch to reject this request, then start again.</span>
              </Card>
            ) : !d.canVerify ? (
              <Card className="rounded-[20px] p-5 text-sm text-ink-2">Claims for this kind of link are coming soon (GitHub repos first).</Card>
            ) : !d.verified ? (
              <Card className="flex flex-col gap-3 rounded-[20px] p-5 text-sm">
                <span className="text-ink-2">Sign in with the GitHub account that owns this repo (or an admin of the organization that owns it). Hatch only reads your account id and organization role, once.</span>
                {urlError && <span className="text-danger">{urlError}</span>}
                <Button asChild>
                  <a href={`/api/links/claim/github/start?mint=${encodeURIComponent(d.mint)}`}>Verify with GitHub</a>
                </Button>
              </Card>
            ) : (
              <Card className="flex flex-col gap-3 rounded-[20px] p-5 text-sm">
                <span className="text-ink">
                  Verified as <span className="font-semibold">{d.verified.login}</span> <span className="text-ink-muted">(GitHub account {d.verified.accountId})</span>
                </span>
                {d.phase === 'gap' ? (
                  <span className="font-semibold text-ink">This coin is moving to its new pool, try again in a few minutes.</span>
                ) : (
                  <>
                    <label className="flex items-start gap-2">
                      <input type="radio" checked={action === 'claim'} onChange={() => setAction('claim')} className="mt-1" />
                      <span>
                        <span className="font-semibold text-ink">Claim to my wallet</span>
                        <span className="block text-ink-2">The held fees and every future fee go to your connected wallet.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" checked={action === 'disown'} onChange={() => setAction('disown')} className="mt-1" />
                      <span>
                        <span className="font-semibold text-ink">Disown and send held fees to a wallet I choose</span>
                        <span className="block text-ink-2">The coin then shows &quot;Disowned by owner&quot; and that wallet.</span>
                      </span>
                    </label>
                    {action === 'claim' ? (
                      wallet.publicKey ? (
                        <span className="text-ink-2">
                          Your wallet: <span className="font-mono text-ink">{wallet.publicKey.toBase58()}</span>
                        </span>
                      ) : (
                        <Button variant="secondary" onClick={() => setShowModal(true)}>
                          Connect a Solana wallet
                        </Button>
                      )
                    ) : (
                      <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Solana wallet address" className="h-11 rounded-md border border-line bg-inset px-3 font-mono text-sm text-ink" />
                    )}
                    {!confirming ? (
                      <Button disabled={!destination} onClick={() => setConfirming(true)}>
                        Continue
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
                        <span className="text-ink">
                          {action === 'claim' ? 'Claim' : 'Disown'} {d.ticker ? `$${d.ticker}` : 'this coin'}: about {formatSol(held)} now, then the creator role, go to <span className="break-all font-mono">{destination}</span>.
                        </span>
                        <span className="text-xs text-ink-muted">Hatch reviews every request and pays every network fee. The wallet can&apos;t be changed after you confirm.</span>
                        <div className="flex gap-2">
                          <Button loading={busy} onClick={() => void submit()}>
                            Confirm
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirming(false)}>
                            Back
                          </Button>
                        </div>
                      </div>
                    )}
                    {error && <span className="text-danger">{error}</span>}
                  </>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
