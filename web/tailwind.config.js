import plugin from 'tailwindcss/plugin';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Resolve a color from a CSS variable (RGB triplet) with alpha support.
 * The variables are defined per-theme in `src/styles/globals.css`.
 */
const themeVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** Hatch v1 design tokens (src/styles/hatch-tokens.css). */
const hatch = {
  'hatch-bg': themeVar('hatch-bg'),
  night: themeVar('hatch-night'),
  yolk: { DEFAULT: themeVar('hatch-yolk'), hi: themeVar('hatch-yolk-hi'), deep: themeVar('hatch-yolk-deep') },
  ember: themeVar('hatch-ember'),
  shell: themeVar('hatch-shell'),
  inset: themeVar('surface-inset'),
  surface: { 1: themeVar('surface-1'), 2: themeVar('surface-2'), 3: themeVar('surface-3') },
  line: { DEFAULT: themeVar('line'), strong: themeVar('line-strong') },
  ink: {
    DEFAULT: themeVar('text-primary'),
    2: themeVar('text-secondary'),
    nav: themeVar('text-nav'),
    muted: themeVar('text-muted'),
    disabled: themeVar('text-disabled'),
    'on-yolk': themeVar('text-on-yolk'),
    accent: themeVar('accent-ink'),
  },
  success: themeVar('success'),
  warning: themeVar('warning'),
  danger: themeVar('error'),
  info: themeVar('info'),
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      screens: {
        xs: '390px',
      },

      fontFamily: {
        display: ['var(--font-unbounded)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // Type scale from the design system (size / line-height / tracking).
      // display-xl Unbounded 700 88/0.98 -3.5% · h1 44/1.05 -2.5% · h2 30/1.15 · h3 20/1.25
      // body-lg 18/1.55 · body 15/1.55 · label 13 · caption 12 · num-lg 28 · num 15 · overline 11
      // (Not named display-*/h* to avoid clashing with Tailwind's text-xl etc.)
      borderRadius: {
        xs: '6px',
        sm: '10px',
        md: '14px',
        lg: '20px',
        xl: '28px',
        pill: '999px',
      },

      boxShadow: {
        'hatch-sm': 'inset 0 1px 0 rgba(246,238,220,0.04), 0 1px 2px rgba(0,0,0,0.4)',
        'hatch-md': '0 8px 24px rgba(0,0,0,0.45)',
        'hatch-lg': '0 24px 64px rgba(0,0,0,0.6)',
        'glow-yolk': '0 0 0 1px rgba(242,169,59,0.45), 0 10px 32px rgba(242,169,59,0.22)',
        'glow-ember': '0 0 0 1px rgba(232,87,42,0.5), 0 0 48px rgba(232,87,42,0.45)',
        'cta-yolk': '0 10px 32px rgba(242,169,59,0.22)',
        'cta-ember': '0 10px 32px rgba(232,87,42,0.3)',
        focus: '0 0 0 4px rgba(242,169,59,0.18)',
      },

      transitionTimingFunction: {
        // Motion: UI 150-200ms ease-out; progress and celebratory motion use a soft spring-ish curve.
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
        xxs: ['0.5rem', { lineHeight: '0.625rem' }],
      },

      backgroundSize: {
        '200-auto': '200% auto',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        shine: {
          from: { backgroundPosition: '200% center' },
          to: { backgroundPosition: '-200% center' },
        },
        shimmer: {
          from: { backgroundPosition: '100% 0' },
          to: { backgroundPosition: '-100% 0' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '70%': { opacity: '1', transform: 'scale(1.06)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        wobble: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-4deg)' },
          '75%': { transform: 'rotate(4deg)' },
        },
        'shell-top': {
          '0%': { transform: 'translate(0,0) rotate(0deg)' },
          '100%': { transform: 'translate(-6%, -22%) rotate(-24deg)' },
        },
        'confetti-fall': {
          '0%': { transform: 'translate3d(0,-20px,0) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '1' },
          '100%': { transform: 'translate3d(var(--drift, 0px), 105vh, 0) rotate(540deg)', opacity: '0.9' },
        },
        'rays-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'live-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(123,211,137,0.6)' },
          '100%': { boxShadow: '0 0 0 6px rgba(123,211,137,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out forwards',
        'fade-out': 'fade-out 0.15s ease-in forwards',
        'shine-reverse': 'shine 3s linear infinite reverse',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'rise-in': 'rise-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        wobble: 'wobble 0.6s ease-in-out 2',
        'shell-top': 'shell-top 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both',
        'rays-spin': 'rays-spin 40s linear infinite',
        'live-pulse': 'live-pulse 1.6s ease-out infinite',
      },

      colors: {
        ...hatch,
        background: themeVar('background'),
        foreground: themeVar('foreground'),

        // Theme-aware scales (inverted between light and dark mode)
        neutral: {
          50: themeVar('neutral-50'),
          100: themeVar('neutral-100'),
          200: themeVar('neutral-200'),
          300: themeVar('neutral-300'),
          400: themeVar('neutral-400'),
          500: themeVar('neutral-500'),
          600: themeVar('neutral-600'),
          700: themeVar('neutral-700'),
          750: themeVar('neutral-750'),
          800: themeVar('neutral-800'),
          850: themeVar('neutral-850'),
          900: themeVar('neutral-900'),
          925: themeVar('neutral-925'),
          950: themeVar('neutral-950'),
        },
        primary: {
          DEFAULT: themeVar('primary'),
          200: themeVar('primary-200'),
          300: themeVar('primary-300'),
          400: themeVar('primary-400'),
          500: themeVar('primary-500'),
          600: themeVar('primary-600'),
          700: themeVar('primary-700'),
          800: themeVar('primary-800'),
          900: themeVar('primary-900'),
          950: themeVar('primary-950'),
        },

        // Status colors: theme-aware DEFAULT, static shades
        amber: {
          50: '#fffbeb',
          100: '#fef3c6',
          200: '#fee685',
          300: '#ffd230',
          400: '#ffb900',
          DEFAULT: themeVar('amber'),
          500: '#fe9a00',
          600: '#e17100',
          700: '#bb4d00',
          800: '#973c00',
          900: '#7b3306',
          950: '#461901',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d0fae5',
          200: '#a4f4cf',
          300: '#5ee9b5',
          400: '#3ce3ab',
          DEFAULT: themeVar('emerald'),
          500: '#02c78c',
          600: '#00a272',
          700: '#00815f',
          800: '#00664c',
          900: '#005440',
          950: '#002f25',
        },
        rose: {
          50: '#fff1f4',
          100: '#ffe4ea',
          200: '#fecddb',
          300: '#fca5bd',
          400: '#f23674',
          DEFAULT: themeVar('rose'),
          500: '#eb2d6f',
          600: '#e01e68',
          700: '#bd1358',
          800: '#9e134f',
          900: '#871449',
          950: '#4b0624',
        },
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    plugin(({ addUtilities, addVariant }) => {
      // Only apply hover styles on devices that actually support hover
      addVariant('has-hover', '@media (hover: hover) and (pointer: fine)');

      addUtilities({
        '.scrollbar-none': {
          'scrollbar-width': 'none',
          '-ms-overflow-style': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      });
    }),
  ],
};
