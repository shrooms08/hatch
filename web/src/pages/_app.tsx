import '@/styles/globals.css';
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
            iconUrls: ['/favicon.ico'],
          },
          // notificationCallback: WalletNotification,
          theme: walletTheme,
          lang: 'en',
        }}
      >
        <HatchEvents />
        <Toaster theme={walletTheme} richColors closeButton />
        <Component {...pageProps} />
      </UnifiedWalletProvider>
    </QueryClientProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <AppProviders {...props} />
    </ThemeProvider>
  );
}
