// Icons drawn in the design files (design/v1). Stroke icons inherit currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const stroke = (size: number, sw: number, props: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

/** The small solid egg used inside buttons ("Hatch a token", "Hatch it"). */
export const EggGlyph = ({ size = 15, ...p }: P) => (
  <svg width={(size * 16) / 20} height={size} viewBox="0 0 16 20" aria-hidden {...p}>
    <path d="M8 1C12 1 15 8 15 12.5C15 16.5 12 19 8 19C4 19 1 16.5 1 12.5C1 8 4 1 8 1Z" fill="currentColor" />
  </svg>
);

export const TrendIcon = ({ size = 13, ...p }: P) => (
  <svg {...stroke(size, 2.5, p)}>
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
  </svg>
);
export const SmileIcon = ({ size = 13, ...p }: P) => (
  <svg {...stroke(size, 2.5, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01" />
  </svg>
);
export const SparkIcon = ({ size = 13, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
  </svg>
);
export const CopyIcon = ({ size = 11, ...p }: P) => (
  <svg {...stroke(size, 2.4, p)}>
    <rect x="8" y="8" width="13" height="13" rx="3" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </svg>
);
export const CheckIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 3, p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const XIcon = ({ size = 14, ...p }: P) => (
  <svg {...stroke(size, 3, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const WarnIcon = ({ size = 18, ...p }: P) => (
  <svg {...stroke(size, 2.2, p)}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);
export const ArrowUpRight = ({ size = 12, ...p }: P) => (
  <svg {...stroke(size, 2.2, p)}>
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);
export const ChevronRight = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const MoonIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
export const SunIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MenuIcon = ({ size = 18, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <path d="M4 8h16M4 16h10" />
  </svg>
);
export const SearchIcon = ({ size = 15, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const DownloadIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2.4, p)}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);
export const PuzzleIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2, p)}>
    <path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7z" />
  </svg>
);
export const UploadIcon = ({ size = 16, ...p }: P) => (
  <svg {...stroke(size, 2.2, p)}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
);

/** Status-pill glyphs. */
export const CrackedEggGlyph = ({ size = 12, ...p }: P) => (
  <svg width={(size * 10) / 12} height={size} viewBox="0 0 10 12" aria-hidden {...p}>
    <path d="M5 0.5C7.5 0.5 9.5 5 9.5 7.5C9.5 10 7.5 11.5 5 11.5C2.5 11.5 0.5 10 0.5 7.5C0.5 5 2.5 0.5 5 0.5Z" fill="currentColor" />
    <path d="M1.5 6L3.5 5L5 6.5L6.5 4.8L8.5 6" stroke="rgb(var(--hatch-yolk))" strokeWidth="1.2" fill="none" />
  </svg>
);
export const HalfShellGlyph = ({ size = 12, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden {...p}>
    <path d="M1 6.5L3 4.5L4.5 6L6 3.5L7.5 6L9 4.5L11 6.5C11 9.5 9 11.5 6 11.5C3 11.5 1 9.5 1 6.5Z" fill="currentColor" />
  </svg>
);
