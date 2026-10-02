import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import Header from '../components/Header';
import { Button } from '@/components/ui/button';
import { PresetPicker } from '@/components/Hatch/PresetPicker';
import { PresetExplainer } from '@/components/Hatch/PresetExplainer';
import { usePresetConfigs } from '@/hooks/useHatch';
import { parsePresetId, type PresetId } from '@/lib/presets';
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  SYMBOL_MAX,
  launchFieldsSchema,
  type LaunchFields,
} from '@/lib/validation/launch';
import { checkImageFile, launchToken } from '@/lib/launch/client';
import { getConnection } from '@/lib/solana/connection';
import { explorerTxUrl } from '@/lib/config/network';
import { emitHatchEvent } from '@/lib/extensionBridge';

const inputClassName =
  'w-full rounded-lg border border-neutral-750 bg-background p-3 text-sm text-foreground placeholder:text-neutral-500 transition-colors focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40';
const labelClassName = 'block text-sm font-medium text-neutral-300 mb-1.5';
const sectionClassName = 'rounded-xl border border-neutral-850 bg-neutral-925 p-5 sm:p-8';

type FormState = Omit<LaunchFields, 'preset'> & { preset: PresetId };

const EMPTY: FormState = { name: '', symbol: '', description: '', preset: 'MEME', source: '', website: '', twitter: '' };

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
      ...(parsePresetId(q('preset')) ? { preset: parsePresetId(q('preset'))! } : {}),
    },
    imageUrl: /^https?:\/\//i.test(q('image')) ? q('image') : '',
  };
}

export default function CreatePool() {
  const router = useRouter();
  const wallet = useWallet();
  const { data: enabledPresets } = usePresetConfigs();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<{ mint: string; signature: string } | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { fields, imageUrl: url } = prefillFromQuery(router.query);
    setForm((f) => ({ ...f, ...fields }));
    if (url) setImageUrl(url);
  }, [router.isReady, router.query]);

  const previewSrc = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : imageUrl), [imageFile, imageUrl]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = launchFieldsSchema.safeParse(form);
    const problems = parsed.success ? [] : Object.values(parsed.error.flatten().fieldErrors).flat();
    if (!imageFile && !imageUrl) problems.push('Token image is required');
    if (imageFile) {
      const imageProblem = checkImageFile(imageFile);
      if (imageProblem) problems.push(imageProblem);
    }
    setErrors(problems as string[]);
    if (!parsed.success || problems.length) return;

    setIsLoading(true);
    try {
      const result = await launchToken({
        wallet,
        connection: getConnection(),
        fields: parsed.data,
        image: imageFile ?? imageUrl,
      });
      toast.success('Your token is hatching!', {
        action: { label: 'View tx', onClick: () => window.open(explorerTxUrl(result.signature), '_blank') },
      });
      setCreated(result);
      emitHatchEvent('launched', wallet.publicKey!.toBase58(), result.mint);
      router.push(`/token/${result.mint}`);
    } catch (err) {
      console.error('Launch failed:', err);
      toast.error(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Launch - Hatch</title>
        <meta name="description" content="Launch a token on Hatch, built on Meteora DBC." />
      </Head>

      <div className="min-h-screen bg-background text-foreground">
        <Header />

        <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
          <div className="mb-8 md:mb-10">
            <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-4xl">Hatch a token</h1>
            <p className="text-neutral-400">Pick a preset, describe your token, and hatch it.</p>
          </div>

          {created && !isLoading ? (
            <p className="text-neutral-300">Launched! Taking you to your token…</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-8" noValidate>
              <div className={sectionClassName}>
                <h2 className="mb-4 text-xl font-bold md:text-2xl">Preset</h2>
                <PresetPicker value={form.preset} onChange={(id) => set('preset', id)} enabled={enabledPresets} />
              </div>

              <div className={sectionClassName}>
                <h2 className="mb-4 text-xl font-bold md:text-2xl">Token Details</h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-4">
                      <label htmlFor="name" className={labelClassName}>
                        Token Name*
                      </label>
                      <input
                        id="name"
                        className={inputClassName}
                        placeholder="e.g. Hatchling"
                        value={form.name}
                        maxLength={NAME_MAX}
                        onChange={(e) => set('name', e.target.value)}
                      />
                    </div>
                    <div className="mb-4">
                      <label htmlFor="symbol" className={labelClassName}>
                        Token Symbol*
                      </label>
                      <input
                        id="symbol"
                        className={inputClassName}
                        placeholder="e.g. HATCH"
                        value={form.symbol}
                        maxLength={SYMBOL_MAX}
                        onChange={(e) => set('symbol', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="tokenLogo" className={labelClassName}>
                      Token Image*
                    </label>
                    <div className="rounded-lg border-2 border-dashed border-neutral-750 p-6 text-center transition-colors hover:border-neutral-600">
                      {previewSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewSrc} alt="" className="mx-auto mb-3 h-16 w-16 rounded-lg object-cover" />
                      ) : (
                        <span className="iconify mx-auto mb-2 h-6 w-6 text-neutral-500 ph--upload-bold" />
                      )}
                      <p className="mb-3 text-xs text-neutral-500">
                        {imageFile?.name ?? (imageUrl ? 'Using image from link' : 'PNG, JPG, WEBP or GIF (max. 2MB)')}
                      </p>
                      <input
                        type="file"
                        id="tokenLogo"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const problem = checkImageFile(file);
                          if (problem) return toast.error(problem);
                          setImageFile(file);
                        }}
                      />
                      <label
                        htmlFor="tokenLogo"
                        className="inline-flex cursor-pointer items-center rounded-full border border-neutral-750 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-900"
                      >
                        Browse Files
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  <label htmlFor="description" className={labelClassName}>
                    Description
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    className={inputClassName}
                    placeholder="What is this token about?"
                    value={form.description}
                    maxLength={DESCRIPTION_MAX}
                    onChange={(e) => set('description', e.target.value)}
                  />
                  <div className="mt-1 text-right text-xs text-neutral-500">
                    {form.description?.length ?? 0}/{DESCRIPTION_MAX}
                  </div>
                </div>

                {form.source && (
                  <p className="mt-2 text-xs text-neutral-400">
                    Inspired by: <span className="break-all text-neutral-300">{form.source}</span>
                  </p>
                )}
              </div>

              <div className={sectionClassName}>
                <h2 className="mb-6 text-xl font-bold md:text-2xl">Social Links (Optional)</h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="website" className={labelClassName}>
                      Website
                    </label>
                    <input
                      id="website"
                      type="url"
                      className={inputClassName}
                      placeholder="https://yourwebsite.com"
                      value={form.website}
                      onChange={(e) => set('website', e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="twitter" className={labelClassName}>
                      Twitter
                    </label>
                    <input
                      id="twitter"
                      type="url"
                      className={inputClassName}
                      placeholder="https://x.com/yourusername"
                      value={form.twitter}
                      onChange={(e) => set('twitter', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="space-y-2 rounded-lg border border-rose/40 bg-rose/10 p-4">
                  {errors.map((error) => (
                    <div key={error} className="flex items-start gap-2">
                      <span className="iconify mt-0.5 h-4 w-4 shrink-0 text-rose ph--warning-circle-bold" />
                      <p className="text-sm text-rose">{error}</p>
                    </div>
                  ))}
                </div>
              )}

              <PresetExplainer preset={form.preset} />

              <div className="flex justify-end">
                <SubmitButton isSubmitting={isLoading} />
              </div>
            </form>
          )}
        </main>
      </div>
    </>
  );
}

const SubmitButton = ({ isSubmitting }: { isSubmitting: boolean }) => {
  const { publicKey } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();

  if (!publicKey) {
    return (
      <Button type="button" onClick={() => setShowModal(true)}>
        <span>Connect Wallet</span>
      </Button>
    );
  }

  return (
    <Button className="flex items-center gap-2" type="submit" disabled={isSubmitting}>
      {isSubmitting ? (
        <>
          <span className="iconify ph--spinner h-5 w-5 animate-spin" />
          <span>Hatching…</span>
        </>
      ) : (
        <>
          <span className="iconify ph--egg-bold h-5 w-5" />
          <span>Hatch it</span>
        </>
      )}
    </Button>
  );
};
