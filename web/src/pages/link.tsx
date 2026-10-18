// /link: minimal test page for link coins (devnet). Paste a URL -> canonical id, metadata, owner, and either
// "Already hatched" or a name/ticker form that hatches it: the server returns ONE partially signed transaction
// (one-time pool creator + your first buy + creator role to the Hatch vault); your wallet signs and sends it.
// Deliberately plain; the real design comes later.
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Transaction } from '@solana/web3.js';
import { useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { Button, Card } from '@/components/ds';
import { getConnection } from '@/lib/solana/connection';
import { confirmByPolling } from '@/lib/dbc/transactions';
import { CANCELLED_COPY, MAYBE_SENT_COPY, sendRefusedBeforeBroadcast } from '@/lib/links/hatchCancel';
import { explorerTxUrl } from '@/lib/config/network';
import { prefillUrl } from '@/lib/links/prefill';

type Prepared = {
  canonicalId: string;
  idHash: string;
  kind: string;
  displayUrl: string;
  maxFirstBuySol: number;
  exists?: { mint: string | null; status: string; name: string | null; ticker: string | null };
  reserved?: { retryInSeconds: number };
  available?: true;
  metadata?: { title: string | null; snippet: string | null; imageUrl: string | null; owner: { platform: string; handle: string | null; name: string | null } };
  suggested?: { name: string; ticker: string; imageUrl: string | null };
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export default function LinkPage() {
  const wallet = useWallet();
  const router = useRouter();
  const prefilled = useRef(false);
  const [url, setUrl] = useState('');
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [firstBuy, setFirstBuy] = useState('0.01');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mint: string; signature: string } | null>(null);

  const check = async (target = url) => {
    setError(null);
    setDone(null);
    setPrep(null);
    setBusy('Reading the link…');
    try {
      const p = await post<Prepared>('/api/links/prepare', { url: target });
      setPrep(p);
      if (p.suggested) {
        setName(p.suggested.name);
        setTicker(p.suggested.ticker);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // /link?u=<url>: fill the input and check it right away (the server validates and canonicalizes as usual).
  useEffect(() => {
    if (!router.isReady || prefilled.current) return;
    prefilled.current = true;
    const u = prefillUrl(router.query.u);
    if (!u) return;
    setUrl(u);
    void check(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const hatch = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !prep) return;
    setError(null);
    if (!(Number(firstBuy || '0') <= prep.maxFirstBuySol)) return setError(`The first buy is capped at ${prep.maxFirstBuySol} SOL`);
    try {
      setBusy('Preparing the transaction…');
      const h = await post<{ transaction: string; mint: string; pool: string; canonicalId: string; lastValidBlockHeight?: number; reservationToken?: string }>('/api/links/hatch', {
        url,
        wallet: wallet.publicKey.toBase58(),
        name,
        ticker,
        imageUrl: prep.suggested?.imageUrl ?? undefined,
        firstBuySol: firstBuy || '0',
      });
      // Free the link right away when this hatch cannot land (see lib/links/hatchCancel).
      const release = () => post('/api/links/release', { canonicalId: h.canonicalId, mint: h.mint, token: h.reservationToken }).catch((): null => null);
      setBusy('Confirm in your wallet…');
      let signed: Transaction;
      try {
        signed = await wallet.signTransaction(Transaction.from(fromBase64(h.transaction)));
      } catch {
        // Rejected or the popup was closed: nothing was signed, so nothing can land.
        await release();
        throw new Error(CANCELLED_COPY);
      }
      setBusy('Sending…');
      const connection = getConnection();
      let signature: string;
      try {
        signature = await connection.sendRawTransaction(signed.serialize());
      } catch (e) {
        if (sendRefusedBeforeBroadcast(e)) {
          await release();
          throw new Error(`${(e as Error).message.split('\n')[0]} ${CANCELLED_COPY}`);
        }
        throw new Error(MAYBE_SENT_COPY);
      }
      await confirmByPolling(connection, signature, h.lastValidBlockHeight ?? (await connection.getBlockHeight('confirmed')) + 150);
      setBusy('Verifying…');
      await post('/api/links/confirm', { canonicalId: h.canonicalId, signature });
      setDone({ mint: h.mint, signature });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Hatch a link - Hatch</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <h1 className="font-display text-3xl font-bold text-ink">Hatch a link (devnet test)</h1>
        <Card className="flex flex-col gap-3 rounded-[20px] p-5">
          <label className="text-sm text-ink-2" htmlFor="link-url">
            A tweet, YouTube video, GitHub repo or web page
          </label>
          <input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://x.com/user/status/…" className="h-11 rounded-md border border-line bg-inset px-3 font-mono text-sm text-ink" />
          <Button onClick={() => check()} disabled={!url || !!busy}>
            Check link
          </Button>
        </Card>

        {prep && (
          <Card className="flex flex-col gap-2 rounded-[20px] p-5 text-sm text-ink-2">
            <div>
              Canonical id: <span className="font-mono text-ink">{prep.canonicalId}</span>
            </div>
            <div>
              Link: <a className="break-all text-ink-accent" href={prep.displayUrl} target="_blank" rel="noreferrer noopener">{prep.displayUrl}</a> ({prep.kind})
            </div>
            {prep.metadata && (
              <>
                <div>Title: <span className="text-ink">{prep.metadata.title ?? '-'}</span></div>
                {prep.metadata.snippet && <div className="text-ink-muted">“{prep.metadata.snippet}”</div>}
                <div>
                  Owner: <span className="text-ink">{prep.metadata.owner.handle ?? prep.metadata.owner.name ?? '-'}</span> ({prep.metadata.owner.platform})
                </div>
                {prep.metadata.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prep.metadata.imageUrl} alt="" width={120} height={120} className="rounded-md object-cover" />
                )}
              </>
            )}
            {prep.exists && (
              <div className="font-semibold text-ink">
                Already hatched{prep.exists.ticker ? ` as $${prep.exists.ticker}` : ''}.{' '}
                {prep.exists.mint && (
                  <Link className="text-ink-accent" href={`/token/${prep.exists.mint}`}>
                    View token
                  </Link>
                )}
              </div>
            )}
            {prep.reserved && <div className="font-semibold text-ink">Someone is hatching this link right now. Try again in {prep.reserved.retryInSeconds}s.</div>}
            {prep.available && (
              <div className="mt-2 flex flex-col gap-2">
                <label>
                  Name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="ml-2 h-9 rounded-md border border-line bg-inset px-2 text-ink" />
                </label>
                <label>
                  Ticker <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={10} className="ml-2 h-9 rounded-md border border-line bg-inset px-2 font-mono text-ink" />
                </label>
                <label>
                  First buy (SOL, max {prep.maxFirstBuySol}){' '}
                  <input value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} inputMode="decimal" className="ml-2 h-9 w-28 rounded-md border border-line bg-inset px-2 font-mono text-ink" />
                </label>
                <span className="text-xs text-ink-muted">Your first buy is in the same transaction as the launch, so it pays the normal 1% fee, not the sniper shield.</span>
                <Button onClick={hatch} disabled={!wallet.publicKey || !!busy}>
                  {wallet.publicKey ? 'Hatch it' : 'Connect a wallet to hatch'}
                </Button>
              </div>
            )}
          </Card>
        )}
        {busy && <div className="text-sm text-ink-2">{busy}</div>}
        {error && <div className="text-sm text-danger">{error}</div>}
        {done && (
          <div className="text-sm text-ink">
            Hatched.{' '}
            <Link className="text-ink-accent" href={`/token/${done.mint}`}>
              View token
            </Link>{' '}
            ·{' '}
            <a className="text-ink-accent" href={explorerTxUrl(done.signature)} target="_blank" rel="noreferrer">
              transaction
            </a>
          </div>
        )}
      </div>
    </Page>
  );
}
