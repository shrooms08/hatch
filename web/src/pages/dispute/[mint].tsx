// /dispute/<mint>: dispute the open claim on a link coin. Contact + reason, stored and shown to Hatch's approver.
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import Page from '@/components/ui/Page/Page';
import { Button, Card } from '@/components/ds';

export const getServerSideProps: GetServerSideProps = async () => {
  const { linkNetwork } = await import('@/lib/server/links/chain');
  const { isVaultConfigured } = await import('@/lib/server/links/squads');
  return linkNetwork() && isVaultConfigured() ? { props: {} } : { notFound: true };
};

export default function DisputePage() {
  const router = useRouter();
  const mint = typeof router.query.mint === 'string' ? router.query.mint : '';
  const [contact, setContact] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/links/claim/dispute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint, contact, reason }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Dispute a claim - Hatch</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <h1 className="font-display text-3xl font-bold text-ink">Dispute this claim</h1>
        <Card className="flex flex-col gap-3 rounded-[20px] p-5 text-sm text-ink-2">
          {done ? (
            <>
              <span className="font-semibold text-ink">Thanks. Hatch&apos;s approver sees your dispute next to the claim before deciding.</span>
              <Link className="text-ink-accent" href={`/token/${mint}`}>
                Back to the coin
              </Link>
            </>
          ) : (
            <>
              <span>If you think the person claiming this coin does not own the link, tell us why. Hatch&apos;s approver reads every dispute before the claim can run.</span>
              <label className="flex flex-col gap-1">
                <span className="text-ink">How can we reach you?</span>
                <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} placeholder="Email, X or GitHub handle" className="h-11 rounded-md border border-line bg-inset px-3 text-sm text-ink" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ink">Why is this claim wrong?</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={5} className="rounded-md border border-line bg-inset p-3 text-sm text-ink" />
              </label>
              {error && <span className="text-danger">{error}</span>}
              <Button className="self-start" loading={busy} disabled={contact.trim().length < 3 || reason.trim().length < 10} onClick={() => void send()}>
                Send dispute
              </Button>
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
