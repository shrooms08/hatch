/**
 * Tunables for the in-page buddy (lib/buddy/grid.ts): sizes, timings and sounds. The art itself (grids,
 * colours, disc) is lib/buddy/art.ts, copied from the web app.
 */

export const SIZE = {
  docked: 64, // CSS px
  hover: 80,
} as const;

export const TIMING = {
  /** chicken <-> egg: the cell-by-cell wave (also the noticed wobble) */
  waveMs: 600,
  /** idle: a blink or peck every [min, max] ms, held this long, with a 1-2 dot twinkle */
  idleMomentEveryMs: [4000, 6000] as const,
  idleMomentMs: 200,
  twinkleMs: 600,
  /** thinking: one pass of the yolk pulse */
  thinkPeriodMs: 1400,
  /** launched / hatched */
  crackMs: 300,
  burstMs: 450,
  reformMs: 550,
  /** reduced motion: how long the cracked egg still frame stays before the chicken */
  reducedHatchMs: 900,
} as const;

export const SOUNDS = {
  chirp: { file: "sfx/chirp.mp3", volume: 0.4 },
  chirpDouble: { file: "sfx/chirp-double.mp3", volume: 1 },
  /** The single chirp plays at most once per this many ms. */
  chirpThrottleMs: 1000,
} as const;

export type SoundName = "chirp" | "chirpDouble";
