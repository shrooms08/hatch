// /admin/claims: for the Hatch approver wallet only. Lists claims; Approve / Reject = the approver signs the Squads
// vote with their own wallet (the server never votes). After an approval the server executes the handover and
// checks on chain that the destination is now the pool creator.
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import bs58 from 'bs58';
import { Transaction } from '@solana/web3.js';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { Button, Card } from '@/components/ds';
import { getConnection } from '@/lib/solana/connection';
import { explorerTxUrl } from '@/lib/config/network';
import { ADMIN_MESSAGE, formatSol, lamportsToSol, shortWallet } from '@/lib/links/claimShared';

type AdminClaim = {
  id: string;
  status: string;
  action: 'claim' | 'disown';
  mint: string | null;
  link: { displayUrl: string; title: string | null; coinName: string | null; ticker: string | null; ownerHandle: string | null } | null;
  verified: { platform: string; accountId: string; login: string | null; at: string };
  destination: string;
  proposal: string | null;
  transactionIndex: number | null;
  proposalState: string | null;
  heldLamports: string | null;
  receivedLamports: string | null;
  executeSignature: string | null;
  error: string | null;
  createdAt: string;
};

export const getServerSideProps: GetServerSideProps = async () => {
  const { linkNetwork } = await import('@/lib/server/links/chain');
  const { isVaultConfigured } = await import('@/lib/server/links/squads');
  return linkNetwork() && isVaultConfigured() ? { props: {} } : { notFound: true };
};

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export default function AdminClaims() {
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const [auth, setAuth] = useState<Record<string, string> | null>(null);
  const [claims, setClaims] = useState<AdminClaim[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async <T,>(method: 'GET' | 'POST', headers: Record<string, string>, body?: object): Promise<T> => {
    const res = await fetch('/api/links/admin/claims', { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
    return json as T;
  };

  const signIn = async () => {
    if (!wallet.publicKey || !wallet.signMessage) return setError('This wallet cannot sign messages');
    setError(null);
    try {
      const ts = Date.now();
      const sig = await wallet.signMessage(new TextEncoder().encode(ADMIN_MESSAGE(ts)));
      const h = { 'x-hatch-wallet': wallet.publicKey.toBase58(), 'x-hatch-ts': String(ts), 'x-hatch-sig': bs58.encode(sig) };
      const r = await call<{ claims: AdminClaim[] }>('GET', h);
      setAuth(h);
      setClaims(r.claims);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const refresh = async () => auth && setClaims((await call<{ claims: AdminClaim[] }>('GET', auth)).claims);

  const vote = async (c: AdminClaim, v: 'approve' | 'reject') => {
    if (!auth || !wallet.signTransaction) return;
    setError(null);
    try {
      setBusy(`${v === 'approve' ? 'Approving' : 'Rejecting'}… confirm in your wallet`);
      const { transaction } = await call<{ transaction: string }>('POST', auth, { op: 'vote', claimId: c.id, vote: v });
      const signed = await wallet.signTransaction(Transaction.from(fromBase64(transaction)));
      const connection = getConnection();
      const signature = await connection.sendRawTransaction(signed.serialize());
      const bh = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({ signature, ...bh }, 'confirmed');
      setBusy(v === 'approve' ? 'Vote recorded. Running the handover and checking it on chain…' : 'Rejected. Closing the request…');
      await call('POST', auth, { op: 'sync', claimId: c.id, signature });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const retry = async (c: AdminClaim) => {
    if (!auth) return;
    setError(null);
    setBusy('Checking…');
    try {
      await call('POST', auth, { op: 'sync', claimId: c.id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Link claims - Hatch admin</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
        <h1 className="font-display text-3xl font-bold text-ink">Link claims</h1>
        {!wallet.publicKey ? (
          <Button className="self-start" onClick={() => setShowModal(true)}>
            Connect the approver wallet
          </Button>
        ) : !auth ? (
          <Card className="flex flex-col gap-3 rounded-[20px] p-5 text-sm text-ink-2">
            <span>
              Connected: <span className="font-mono text-ink">{wallet.publicKey.toBase58()}</span>. Sign a message to prove this is the approver wallet (no transaction, no fee).
            </span>
            <Button className="self-start" onClick={() => void signIn()}>
              Sign in
            </Button>
          </Card>
        ) : null}
        {busy && <div className="text-sm text-ink-2">{busy}</div>}
        {error && <div className="text-sm text-danger">{error}</div>}
        {claims && claims.length === 0 && <Card className="rounded-[20px] p-5 text-sm text-ink-2">No claims yet.</Card>}
        {claims?.map((c) => {
          const open = ['pending', 'proposed', 'approved'].includes(c.status);
          return (
            <Card key={c.id} className="flex flex-col gap-1.5 rounded-[20px] p-5 text-sm text-ink-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {c.action === 'claim' ? 'Claim' : 'Disown'} · {c.link?.coinName ?? '?'} {c.link?.ticker && `$${c.link.ticker}`}
                </span>
                <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-xs">
                  {c.status}
                  {c.proposalState && open ? ` · proposal ${c.proposalState}` : ''}
                </span>
              </div>
              {c.link && (
                <a className="break-all font-mono text-ink-accent" href={c.link.displayUrl} target="_blank" rel="noreferrer noopener">
                  {c.link.displayUrl}
                </a>
              )}
              <span>
                Verified: <span className="text-ink">{c.verified.login}</span> ({c.verified.platform} account {c.verified.accountId}) at {new Date(c.verified.at).toLocaleString()}
              </span>
              <span>
                Destination: <span className="break-all font-mono text-ink">{c.destination}</span>
              </span>
              <span>
                Held now: <span className="font-mono text-ink">{formatSol(lamportsToSol(c.heldLamports))}</span>
                {c.receivedLamports && <> · received {formatSol(lamportsToSol(c.receivedLamports))}</>}
              </span>
              {c.proposal && <span className="font-mono text-xs text-ink-muted">Proposal {shortWallet(c.proposal)} (#{c.transactionIndex})</span>}
              {c.executeSignature && (
                <a className="text-ink-accent" href={explorerTxUrl(c.executeSignature)} target="_blank" rel="noreferrer">
                  Handover transaction
                </a>
              )}
              {c.error && <span className="text-xs text-danger">{c.error}</span>}
              {c.mint && (
                <Link className="text-ink-accent" href={`/token/${c.mint}`}>
                  Token page
                </Link>
              )}
              {open && auth && (
                <div className="mt-1 flex gap-2">
                  {c.status === 'proposed' && (
                    <>
                      <Button size="sm" disabled={!!busy} onClick={() => void vote(c, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void vote(c, 'reject')}>
                        Reject
                      </Button>
                    </>
                  )}
                  {c.status === 'approved' && (
                    <Button size="sm" disabled={!!busy} onClick={() => void retry(c)}>
                      Run the approved handover
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
