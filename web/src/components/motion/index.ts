// Animated components, client only: each loads with next/dynamic (ssr: false). The engine lives in lib/motion.
import dynamic from 'next/dynamic';
import { createElement } from 'react';

export type { CrackPhase } from './CrackButton';

/** Placeholder the size of the launch CTA while the button's code loads. */
const CtaPlaceholder = () => createElement('div', { 'aria-hidden': true, className: 'h-[62px] w-full rounded-pill bg-yolk/60' });

export const CrackButton = dynamic(() => import('./CrackButton').then((m) => m.CrackButton), { ssr: false, loading: CtaPlaceholder });
export const HatchBurst = dynamic(() => import('./HatchBurst').then((m) => m.HatchBurst), { ssr: false });
export const EggFill = dynamic(() => import('./EggFill').then((m) => m.EggFill), { ssr: false });
export const ShieldIllustration = dynamic(() => import('./SniperShield').then((m) => m.ShieldIllustration), { ssr: false });
export const ShieldLive = dynamic(() => import('./SniperShield').then((m) => m.ShieldLive), { ssr: false });
export const DotNumber = dynamic(() => import('./DotNumber').then((m) => m.DotNumber), { ssr: false });
