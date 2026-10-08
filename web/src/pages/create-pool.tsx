import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { Button, Card, EggGlyph, Field, HonestNote, InspiredChip, Input, Note, PresetBadge, PresetCard, TextArea, UploadIcon, notify } from '@/components/ds';
import { TokenArt } from '@/components/ds/TokenArt';
import { HatchedMoment } from '@/components/Hatch/HatchedMoment';
import { OpenInWallet } from '@/components/Hatch/OpenInWallet';
import { useConfigThreshold, usePresetConfigs, useShieldedConfigs } from '@/hooks/useHatch';
import { PRESET_IDS, PRESETS, parsePresetId, stockPreset, type PresetId } from '@/lib/presets';
import { DESCRIPTION_MAX, NAME_MAX, SYMBOL_MAX, launchFieldsSchema, type LaunchFields } from '@/lib/validation/launch';
import { checkImageFile, launchToken } from '@/lib/launch/client';
import { getConnection } from '@/lib/solana/connection';
import { EXPLORER_NAME, explorerTxUrl } from '@/lib/config/network';
import { emitHatchEvent } from '@/lib/extensionBridge';
import { formatAmount } from '@/lib/format/amount';
import { sourceDomain } from '@/lib/metadata/token';
import { cn } from '@/lib/utils';

type FormState = Omit<LaunchFields, 'preset'> & { preset: PresetId };
type FieldErrors = Partial<Record<keyof FormState | 'image', string>>;

const EMPTY: FormState = { name: '', symbol: '', description: '', preset: 'MEME', stock: '', source: '', website: '', twitter: '' };

const PRESET_COPY: Record<PresetId, string> = {
  STOCK: 'Pool priced in tokenized {stock}.',
  MEME: 'A fun community token, bought with SOL.',
  AI_AGENT: 'Gentler curve, creator-first fees.',
};

function firstQueryValue(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Prefill from ?name=&symbol=&description=&image=&preset=&source= (used by the Chrome extension). */
function prefillFromQuery(query: Record<string, string | string[] | undefined>) {
  const q = (k: string) => firstQueryValue(query[k]).trim();
  return {
    fields: {
      name: q('name').slice(0, NAME_MAX),
      symbol: q('symbol').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, SYMBOL_MAX),
      description: q('description').slice(0, DESCRIPTION_MAX),
      source: /^https?:\/\//i.test(q('source')) ? q('source') : '',
      stock: q('stock').toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 8),
      ...(parsePresetId(q('preset')) ? { preset: parsePresetId(q('preset'))! } : {}),
    },
    // A generated egg from the extension's draft is re-rendered at launch for the final ticker.
    imageUrl: /^https?:\/\//i.test(q('image')) && !q('image').includes('/images/fallback/') ? q('image') : '',
  };
}

export default function CreatePool() {
  const router = useRouter();
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const { data: enabledPresets } = usePresetConfigs();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<{ mint: string; signature: string } | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { fields, imageUrl: url } = prefillFromQuery(router.query);
    setForm((f) => ({ ...f, ...fields }));
    if (url) setImageUrl(url);
    // Development only: preview the Hatched! moment without launching (?demo=hatched&mint=...).
    if (process.env.NODE_ENV !== 'production' && router.query.demo === 'hatched' && typeof router.query.mint === 'string') {
      setCreated({ mint: router.query.mint, signature: '' });
    }
  }, [router.isReady, router.query]);

  const previewSrc = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : imageUrl), [imageFile, imageUrl]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const stocks = Object.values(enabledPresets?.stocks ?? {});
  const selectedStock = enabledPresets?.stocks[form.stock ?? ''] ?? null;
  // Default to the first available stock; an unlisted ?stock= stays visible as "coming soon".
  useEffect(() => {
    if (form.preset === 'STOCK' && !form.stock && stocks[0]) set('stock', stocks[0].ticker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.preset, form.stock, stocks.length]);

  const preset = form.preset === 'STOCK' ? stockPreset(selectedStock) : PRESETS[form.preset];
  const quoteSymbol = form.preset === 'STOCK' ? selectedStock?.symbol ?? 'stock' : 'SOL';
  const configKey = form.preset === 'STOCK' ? selectedStock?.config : enabledPresets?.configs[form.preset];
  const threshold = useConfigThreshold(configKey);
  // Sniper shield per card: STOCK shows it when the selected (or first) stock's config has one.
  const shieldKeys = { STOCK: (selectedStock ?? stocks[0])?.config, MEME: enabledPresets?.configs.MEME, AI_AGENT: enabledPresets?.configs.AI_AGENT };
  const shielded = useShieldedConfigs(Object.values(shieldKeys).filter((k): k is string => !!k));
  const domain = sourceDomain(form.source || undefined);
  const paired = form.preset === 'STOCK' ? selectedStock?.symbol ?? null : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey) return setShowModal(true);
    const parsed = launchFieldsSchema.safeParse(form);
    const next: FieldErrors = {};
    if (!parsed.success) {
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) if (v?.[0]) next[k as keyof FieldErrors] = v[0];
    }
    if (imageFile) {
      const imageProblem = checkImageFile(imageFile);
      if (imageProblem) next.image = imageProblem;
    }
    setErrors(next);
    setFormError(null);
    if (!parsed.success || Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0] === 'image' ? 'tokenLogo' : Object.keys(next)[0])?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const result = await launchToken({
        wallet,
        connection: getConnection(),
        fields: parsed.data,
        image: imageFile ?? imageUrl,
      });
      notify.success({ title: 'Your token is hatching!', action: { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(result.signature) } });
      setCreated(result);
      emitHatchEvent('launched', wallet.publicKey!.toBase58(), result.mint);
    } catch (err) {
      console.error('Launch failed:', err);
      const message = err instanceof Error ? err.message : 'Launch failed';
      setFormError(message);
      notify.error({ title: "Launch didn't go through", body: message });
    } finally {
      setIsLoading(false);
    }
  };

  const presetCards = (
    <div role="radiogroup" aria-label="Launch preset" className="flex flex-col gap-2.5">
      {(['STOCK', 'MEME', 'AI_AGENT'] as const)
        // Presets without a config on this network are hidden (STOCK stays, shown as "coming soon").
        .filter((id) => id === 'STOCK' || !enabledPresets || !!enabledPresets.configs[id])
        .map((id) => {
        const stockSymbols = enabledPresets ? Object.values(enabledPresets.stocks).map((s) => s.symbol) : [];
        const isEnabled = !enabledPresets || (id === 'STOCK' ? stockSymbols.length > 0 : !!enabledPresets.configs[id]);
        return (
          <PresetCard
            key={id}
            preset={id}
            title={PRESETS[id].label}
            quote={id === 'STOCK' ? stockSymbols.join(' · ') || 'stock' : 'SOL'}
            description={PRESET_COPY[id].replace('{stock}', selectedStock?.name ?? stocks[0]?.name ?? 'stock')}
            selected={form.preset === id}
            disabled={!isEnabled}
            disabledNote={id === 'STOCK' ? 'Coming soon on this network.' : 'Not enabled on this server.'}
            shield={!!shieldKeys[id] && !!shielded.data?.has(shieldKeys[id]!)}
            onSelect={() => set('preset', id)}
          />
        );
      })}
    </div>
  );

  const howItWorks = (
    <Note title="How it works">
      Buyers pay with {quoteSymbol}
      {form.preset === 'STOCK' ? ' or SOL' : ''}. Every buy nudges the price up.{' '}
      {threshold.data ? `At ${formatAmount(threshold.data)} ${quoteSymbol} it hatches into a Meteora pool.` : 'When the goal is reached it hatches into a Meteora pool.'} 1% fee per trade, split with Hatch.
    </Note>
  );
  const honest = form.preset === 'STOCK' ? <HonestNote>{preset.explainer[2]?.replace("The stock token's issuer", 'The issuer')}</HonestNote> : null;
  const submit = (
    <Button type="submit" size="lg" block glow loading={isLoading} className="h-[62px]">
      {!wallet.publicKey ? (
        'Connect wallet'
      ) : isLoading ? (
        'Hatching…'
      ) : (
        <>
          <EggGlyph size={20} />
          Hatch it
        </>
      )}
    </Button>
  );

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Hatch a token - Hatch</title>
        <meta name="description" content="Launch a token on Hatch, built on Meteora DBC." />
      </Head>

      <form onSubmit={onSubmit} noValidate className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-[18px] md:gap-6">
          {domain && <InspiredChip domain={domain} href={form.source} className="self-start" />}
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] font-bold leading-none tracking-[-0.035em] text-ink md:text-[44px]">Hatch a token</h1>
            <p className="text-[15px] text-ink-2">Pick a preset, describe your token, and hatch it. You sign with your own wallet.</p>
          </div>

          <section className="flex flex-col gap-3" aria-labelledby="preset-h">
            <h2 id="preset-h" className="sr-only">
              Preset
            </h2>
            {presetCards}
            {form.preset === 'STOCK' && (stocks.length > 1 || (form.stock && !selectedStock)) && (
              <Field label="Paired stock" htmlFor="stock" error={form.stock && !selectedStock ? `Stock-paired launches for ${form.stock} are coming soon. Pick an available stock or another preset.` : undefined}>
                <select
                  id="stock"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                  className="h-[52px] w-full rounded-md border border-line bg-inset px-4 text-[15px] text-ink outline-none focus:border-yolk focus:shadow-focus"
                >
                  {form.stock && !selectedStock && <option value={form.stock}>{form.stock} (coming soon)</option>}
                  {stocks.map((s) => (
                    <option key={s.ticker} value={s.ticker}>
                      {s.name} ({s.ticker}) · priced in {s.symbol}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </section>

          {/* Image: generated egg by default, or an upload */}
          <div>
            <div
              className={cn(
                'flex items-center gap-3 rounded-[16px] border-[1.5px] border-dashed p-3 transition-colors',
                errors.image ? 'border-danger' : 'border-line-strong hover:border-ink-muted'
              )}
            >
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt="" className="h-16 w-16 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <TokenArt ticker={form.symbol || 'HATCH'} seed={form.symbol || 'HATCH'} paired={paired} size={64} />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs leading-snug text-ink-muted">
                  {imageFile ? imageFile.name : imageUrl ? 'Using the image from the page.' : 'Generated for you. Or upload PNG, JPG, WEBP, GIF (2MB).'}
                </span>
                <div className="flex gap-4">
                  <label htmlFor="tokenLogo" className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-accent hover:underline">
                    <UploadIcon size={14} />
                    Browse files
                  </label>
                  {(imageFile || imageUrl) && (
                    <button
                      type="button"
                      className="text-[13px] font-medium text-ink-muted hover:text-ink"
                      onClick={() => {
                        setImageFile(null);
                        setImageUrl('');
                      }}
                    >
                      Use generated
                    </button>
                  )}
                </div>
              </div>
              <input
                type="file"
                id="tokenLogo"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const problem = checkImageFile(file);
                  if (problem) return setErrors((x) => ({ ...x, image: problem }));
                  setErrors((x) => ({ ...x, image: undefined }));
                  setImageFile(file);
                }}
              />
            </div>
            {errors.image && <p className="mt-2 text-xs text-danger">{errors.image}</p>}
          </div>

          <div className="grid gap-[18px] md:grid-cols-2">
            <Field label="Token name" required htmlFor="name" error={errors.name} aside={`${form.name.length}/${NAME_MAX}`}>
              <Input id="name" placeholder="e.g. Hatchling" value={form.name} maxLength={NAME_MAX} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Ticker" required htmlFor="symbol" error={errors.symbol} aside={`${form.symbol.length}/${SYMBOL_MAX}`}>
              <Input
                id="symbol"
                prefix="$"
                mono
                placeholder="HATCH"
                value={form.symbol}
                maxLength={SYMBOL_MAX}
                invalid={!!errors.symbol}
                onChange={(e) => set('symbol', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="description" error={errors.description} aside={`${form.description?.length ?? 0}/${DESCRIPTION_MAX}`}>
            <TextArea
              id="description"
              rows={3}
              placeholder="What is this token about?"
              value={form.description}
              maxLength={DESCRIPTION_MAX}
              invalid={!!errors.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="grid gap-[18px] md:grid-cols-2">
            <Field label="Website" htmlFor="website" error={errors.website} hint="Optional">
              <Input id="website" type="url" placeholder="https://yourwebsite.com" value={form.website} invalid={!!errors.website} onChange={(e) => set('website', e.target.value)} />
            </Field>
            <Field label="X / Twitter" htmlFor="twitter" error={errors.twitter} hint="Optional">
              <Input id="twitter" type="url" placeholder="https://x.com/yourname" value={form.twitter} invalid={!!errors.twitter} onChange={(e) => set('twitter', e.target.value)} />
            </Field>
          </div>

          {/* Mobile: explainer + action at the end of the form */}
          <div className="flex flex-col gap-[18px] lg:hidden">
            {howItWorks}
            {honest}
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            {submit}
            <OpenInWallet />
          </div>
        </div>

        {/* Desktop: live preview + action, sticky */}
        <aside className="hidden flex-col gap-5 lg:sticky lg:top-24 lg:flex" aria-label="Preview">
          <Card className="flex flex-col items-center gap-5 rounded-[24px] p-6">
            <div className="relative">
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt="" className="h-[220px] w-[220px] rounded-[35px] object-cover" />
              ) : (
                <TokenArt ticker={form.symbol || 'HATCH'} seed={form.symbol || 'HATCH'} paired={paired} size={220} />
              )}
            </div>
            <div className="flex w-full min-w-0 flex-col items-center gap-2 text-center">
              <span className="w-full truncate font-display text-2xl font-bold tracking-[-0.03em] text-ink">{form.name || 'Your token'}</span>
              <span className="font-mono text-sm text-ink-muted">${form.symbol || 'TICKER'}</span>
              <PresetBadge preset={form.preset} quote={quoteSymbol} />
            </div>
          </Card>
          {howItWorks}
          {honest}
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
          {submit}
          <p className="text-center text-xs text-ink-muted">You sign and pay the network fee with your wallet. Hatch never holds your keys.</p>
        </aside>
      </form>

      {created && (
        <HatchedMoment
          open
          name={form.name}
          symbol={form.symbol}
          mint={created.mint}
          paired={paired}
          preset={form.preset}
          stockTicker={form.preset === 'STOCK' ? selectedStock?.ticker ?? null : null}
          shield={!!configKey && !!shielded.data?.has(configKey)}
          onView={() => void router.push(`/token/${created.mint}`)}
          onClose={() => void router.push(`/token/${created.mint}`)}
        />
      )}
    </Page>
  );
}
