/**
 * Everything tunable about the orb buddy: palette, sizes, shapes, timings, glow and sounds.
 * Renderer (entrypoints/content/orb-buddy.ts) and shapes (lib/buddy/shapes.ts) read from here.
 */

export const PALETTE = {
  night: "#120E0B", // orb body / background
  yolk: "#F2A93B", // resting glow, accents
  ember: "#E8572A", // hatch moments
  shell: "#F6EEDC", // dots, highlights
  ash: "#8A8178", // subtle edges
} as const;

export const SIZE = {
  docked: 64, // CSS px
  hover: 80,
  /** Canvas is larger than the orb so the glow can spill outside it (ratio of orb diameter). */
  canvasRatio: 1.5,
  /** Figure radius as a fraction of the orb radius. */
  figureRatio: 0.6,
} as const;

export const DOTS = {
  /** Total dots in the chicken/egg figure (hard cap 250). */
  count: 200,
  /** How many of them trace the silhouette (the rest fill it). */
  outline: 128,
  max: 250,
  /** Dot radius in orb-space px at 64 px (scaled with size). */
  radius: 1.05,
  accentRadius: 1.2,
  /** Fraction of dots that streak in like meteors during the chicken -> egg morph. */
  meteorFraction: 0.08,
} as const;

export const TIMING = {
  /** chicken <-> egg morph */
  morphMs: 750,
  /** extra random delay per dot during a morph (0..this) */
  morphJitterMs: 220,
  breathePeriodMs: 3200,
  breatheAmp: 0.03,
  /** idle head bob/peck: random interval in [min, max] */
  peckEveryMs: [4000, 6000] as const,
  peckMs: 420,
  twinkleEveryMs: 1800,
  twinkleMs: 650,
  noticedWobbleMs: 1100,
  /** thinking: interior dots swirl (radians per second) */
  swirlSpeed: 0.9,
  readyPulseMs: 2400,
  /** launched / hatched sequence */
  crackMs: 380,
  burstMs: 520,
  reformMs: 950,
  /** Idle breathing is capped at this frame rate (GLANCE's orb did the same). */
  idleFps: 30,
} as const;

export type GlowState = "idle" | "noticed" | "thinking" | "ready" | "hatching";

/** Glow colour and strength (0..1) per state; the renderer eases between them. */
export const GLOW: Record<GlowState, { color: keyof typeof PALETTE; strength: number; pulse: number }> = {
  idle: { color: "yolk", strength: 0.22, pulse: 0 },
  noticed: { color: "yolk", strength: 0.62, pulse: 0.08 },
  thinking: { color: "yolk", strength: 0.5, pulse: 0.18 },
  ready: { color: "yolk", strength: 0.72, pulse: 0.12 },
  hatching: { color: "ember", strength: 1, pulse: 0 },
};

/** The thinking-orbs engine layer behind the figure (recoloured Shell/Ash). */
export const ENGINE_LAYER: Record<GlowState, { state: "breathing" | "working" | "weaving"; alpha: number }> = {
  idle: { state: "breathing", alpha: 0.16 },
  noticed: { state: "breathing", alpha: 0.22 },
  thinking: { state: "working", alpha: 0.42 },
  ready: { state: "breathing", alpha: 0.26 },
  hatching: { state: "weaving", alpha: 0.3 },
};

export const SOUNDS = {
  chirp: { file: "sfx/chirp.mp3", volume: 0.4 },
  chirpDouble: { file: "sfx/chirp-double.mp3", volume: 1 },
  /** The single chirp plays at most once per this many ms. */
  chirpThrottleMs: 1000,
} as const;

export type SoundName = "chirp" | "chirpDouble";
