// Fonts via next/font (self-hosted at build time, no runtime Google request):
// Unbounded (display, 600-700), Geist (UI, 400-600), Geist Mono (numbers, 400-500).
import { Geist, Geist_Mono, Unbounded } from 'next/font/google';

export const unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '700'], display: 'swap', variable: '--font-unbounded' });
export const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-geist' });
export const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-geist-mono' });

/** CSS that exposes the font families as variables on :root (portals and the wallet modal included). */
export const fontVariablesCss = `:root{--font-unbounded:${unbounded.style.fontFamily};--font-geist:${geist.style.fontFamily};--font-geist-mono:${geistMono.style.fontFamily};}`;
