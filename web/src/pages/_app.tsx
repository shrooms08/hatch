import '@/styles/globals.css';
import { fontVariablesCss } from '@/lib/fonts';
import { Adapter, UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import type { AppProps } from 'next/app';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWindowWidthListener } from '@/lib/device';
import { NETWORK } from '@/lib/config/network';
import { useWalletHatchEvents } from '@/lib/extensionBridge';
import { DEFAULT_SOCIAL, SocialMeta } from '@/components/SocialMeta';
import { OnboardingProvider } from '@/components/Onboarding/Walkthrough';

/** Lives inside the wallet provider so it can see the connected wallet. */
function HatchEvents(): null {
  useWalletHatchEvents();
  return null;
}

function AppProviders({ Component, pageProps }: AppProps) {
  const { resolvedTheme } = useTheme();

  const wallets: Adapter[] = useMemo(() => {
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter()].filter(
      (item) => item && item.name && item.icon
    ) as Adapter[];
  }, []);

  const queryClient = useMemo(() => new QueryClient(), []);

  useWindowWidthListener();

  const walletTheme = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <UnifiedWalletProvider
        wallets={wallets}
        config={{
          env: NETWORK,
          autoConnect: true,
          metadata: {
            name: 'Hatch',
            description: 'Launch a token quoted in the stock you are looking at.',
            url: typeof window === 'undefined' ? 'https://hatch.local' : window.location.origin,
            iconUrls: ['/brand/icon-192.png'],
          },
          // notificationCallback: WalletNotification,
          theme: walletTheme,
          lang: 'en',
        }}
      >
        <HatchEvents />
        <SocialMeta {...DEFAULT_SOCIAL} />
        {/* Toasts are rendered by components/ds/Toast (sonner custom), placed under the header. */}
        <Toaster theme={walletTheme} position="top-right" offset={{ top: 88, right: 24 }} mobileOffset={{ top: 72 }} gap={12} />
        <OnboardingProvider>
          <Component {...pageProps} />
        </OnboardingProvider>
      </UnifiedWalletProvider>
    </QueryClientProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <style dangerouslySetInnerHTML={{ __html: fontVariablesCss }} />
      <AppProviders {...props} />
    </ThemeProvider>
  );
}
