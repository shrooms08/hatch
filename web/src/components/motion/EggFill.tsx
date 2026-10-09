// Egg fill (lab specimen 2): the egg fills to the pool's REAL bonding-curve progress. It starts at the true
// value (no fake fill-up); when the poll shows the reserve grew, the level pours up with a ripple and a
// "+X SOL" floater for the real amount. Cracks and glow past 80%, "Ready to hatch" at 100%.
//
// Fill mapping: the egg's interior has 9 rows; progress 0..1 fills them bottom-up in proportion
// (level = progress x 9 rows). Above 0 but below one full row, only the bottom row shows, with a soft
// pulsing glow. Bubbles rise from the current fill level.
//
// variant "full" (token page, desktop): no disc ring and no grid dots outside the egg; the egg is scaled to
// ~85% of the canvas height on whole device pixels. "compact" (mobile, beside the %): the lab's disc look.
import { useEffect, useRef } from 'react';
import { EGG, HEX, P, at, bgGrid, belowY, clamp, css, disc, drawParts, emit, mix, text, type Geom, type Scene } from '@/lib/motion/engine';
import type { Spec } from '@/lib/motion/runner';
import { useMotion } from '@/lib/motion/useMotion';
import { cn } from '@/lib/utils';

type Floater = { t: number; txt: string; side: number };
type S = Scene & { L: number; target: number; vel: number; rip: number; floaters: Floater[]; bub: number; flash: number; ready: boolean };
type Variant = 'full' | 'compact';

const CRACKS: [number, number][][] = [
  [[5, 0.5], [4.6, 1.4], [5.3, 2.2], [4.8, 3.1]],
  [[3.2, 2.5], [3.9, 3.0], [3.5, 3.7]],
  [[6.9, 2.4], [6.3, 3.0], [6.8, 3.8]],
];

const inEgg = (x: number, y: number) => at(EGG, x, y) !== '.';
const isInterior = (x: number, y: number) => inEgg(x, y) && inEgg(x - 1, y) && inEgg(x + 1, y) && inEgg(x, y - 1) && inEgg(x, y + 1);
/** Interior rows (rows 1..9 of the 11x11 egg); filling runs from the bottom one up. */
const INTERIOR_ROWS = [...new Set(Array.from({ length: 121 }, (_, i) => [i % 11, Math.floor(i / 11)] as const).filter(([x, y]) => isInterior(x, y)).map(([, y]) => y))].sort((a, b) => a - b);
const ROWS = INTERIOR_ROWS.length;
const BOTTOM = INTERIOR_ROWS[ROWS - 1];

/** Fill level in rows, from the bottom (0..ROWS). */
const levelOf = (L: number) => clamp(L) * ROWS;
/** Surface y (grid units, the egg's own rows) for a level, at column x; waves only once a row is full. */
function surfaceAt(level: number, x: number, t: number, rip: number) {
  const base = BOTTOM + 0.5 - level;
  if (level < 1) return base;
  return base + Math.sin(x * 0.9 + t * 6) * (0.08 + 0.45 * rip) + Math.sin(x * 1.7 - t * 3.3) * 0.06;
}

/** Full variant: the 11-row egg spans ~85% of the height (its widest row is 9 dots, so 11 columns may use the full width), on whole device pixels. */
function fullGeom(w: number, h: number): Geom {
  const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const cell = Math.max(1 / dpr, Math.floor((Math.min((h * 0.85) / 11, w / 11)) * dpr) / dpr);
  // R: half the egg's height, so the lab's helpers (belowY, floater offsets) scale with the egg.
  return { w, h, cx: snap(w / 2), cy: snap(h / 2), R: cell * 5.5, cell };
}

const fillSpec = (initial: number, variant: Variant, showLabel: boolean): Spec<S> => ({
  dur: Infinity,
  geom: variant === 'full' ? fullGeom : undefined,
  setup(S) {
    S.L = initial;
    S.target = initial;
    S.vel = 0;
    S.rip = 0;
    S.floaters = [];
    S.bub = 0;
    S.flash = 0;
    S.ready = false;
  },
  settle(S) {
    S.L = S.target;
    S.vel = 0;
    S.rip = 0;
    S.parts = [];
    S.floaters = [];
  },
  update(S, dt) {
    const a = (S.target - S.L) * 60 - S.vel * 12;
    S.vel += a * dt;
    S.L += S.vel * dt;
    S.rip *= Math.pow(0.15, dt);
    S.flash *= Math.pow(0.3, dt);
    // Bubbles rise from the current fill level (none while the egg is empty).
    const level = levelOf(S.L);
    if (level > 0) {
      S.bub += dt * (2 + S.L * 6);
      while (S.bub > 1) {
        S.bub -= 1;
        const row = Math.min(BOTTOM, Math.round(BOTTOM + 0.5 - Math.max(level, 1)));
        const xs = Array.from({ length: 11 }, (_, x) => x).filter((x) => isInterior(x, row));
        const gx = xs[Math.floor(Math.random() * xs.length)] ?? 5;
        const surf = BOTTOM + 0.5 - level;
        emit(S, { x: gx - 5 + (Math.random() - 0.5) * 0.6, y: surf - 5 + 0.1, vx: (Math.random() - 0.5) * 0.3, vy: -0.9 - Math.random() * 0.8, life: 0.9 + Math.random() * 0.5, r: 0.1 + Math.random() * 0.07, c: [255, 214, 140], gl: 0.5 });
      }
    }
  },
  draw(ctx, G, S) {
    const t = S.t;
    const L = clamp(S.L);
    const level = levelOf(S.L);
    const full = variant === 'full';
    if (full) {
      // No ring, no outside grid. At 100% a soft yolk glow sits behind the egg instead of the disc glow.
      if (S.ready) {
        const g = ctx.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, G.cell * 7.5);
        g.addColorStop(0, `rgba(242,169,59,${0.22 + 0.25 * S.flash})`);
        g.addColorStop(1, 'rgba(242,169,59,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.w, G.h);
      }
    } else {
      disc(ctx, G, S.ready ? 14 + S.flash * 20 : 0);
      bgGrid(ctx, G);
    }
    const crack = clamp((L - 0.8) / 0.2);
    // Below one full row: only the bottom row, glowing softly (never more).
    const trickle = level > 0 && level < 1 ? 0.45 + 0.25 * Math.sin(t * 3.2) : 0;
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 11; x++) {
        if (!inEgg(x, y)) continue;
        const px = G.cx + (x - 5) * G.cell;
        const py = G.cy + (y - 5) * G.cell;
        if (!isInterior(x, y)) {
          let j = 0;
          if (crack > 0 && y < 5) j = (Math.random() - 0.5) * 0.06 * G.cell * crack;
          ctx.fillStyle = HEX.shell;
          ctx.beginPath();
          ctx.arc(px + j, py + j, G.cell * 0.36, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const f = trickle ? (y === BOTTOM ? trickle : 0) : level <= 0 ? 0 : clamp(y + 0.5 - surfaceAt(level, x, t, S.rip));
        const c = mix(P.dim2, P.yolk, f);
        if (f > 0.05) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(242,169,59,${(trickle ? 0.28 : 0.16) * f})`;
          ctx.beginPath();
          ctx.arc(px, py, G.cell * (trickle ? 1.1 : 0.9), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.arc(px, py, G.cell * (0.32 + 0.05 * f), 0, Math.PI * 2);
        ctx.fill();
      }
    // Bubbles stay inside the egg (an ellipse around the 11x11 egg).
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(G.cx, G.cy, G.cell * 4.6, G.cell * 5.4, 0, 0, Math.PI * 2);
    ctx.clip();
    drawParts(ctx, G, S);
    ctx.restore();
    if (crack > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      CRACKS.forEach((pts, ci) => {
        const pr = clamp(crack * 3 - ci * 0.8);
        if (pr <= 0) return;
        const n = Math.max(2, Math.ceil(pts.length * pr));
        ctx.save();
        ctx.shadowColor = HEX.yolk;
        ctx.shadowBlur = 14 * pr;
        ctx.strokeStyle = HEX.ember;
        ctx.lineWidth = G.cell * 0.2;
        ctx.beginPath();
        pts.slice(0, n).forEach(([x, y], i) => {
          const px = G.cx + (x - 5) * G.cell;
          const py = G.cy + (y - 5) * G.cell;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      });
    }
    S.floaters.forEach((f) => {
      const age = t - f.t;
      if (age > 1.1) return;
      text(ctx, f.txt, G.cx + f.side * G.R * 0.62, G.cy - G.R * 0.15 - age * G.cell * 2.2, Math.max(11, G.cell * 0.62), HEX.yolk, '700', undefined, 1 - age / 1.1);
    });
    // The card shows the % beside the egg; the egg itself announces the end state.
    if (showLabel && S.ready) text(ctx, 'Ready to hatch', G.cx, belowY(G), Math.max(13, G.cell * 0.6), HEX.yolk);
  },
});

const pctLabel = (p: number) => `${p < 0.01 ? (p * 100).toFixed(2) : Math.floor(p * 100)}% to hatch`;

/**
 * progress: 0..1 from the pool. raised: the quote reserve (UI amount) from the same poll, for the "+X" floater.
 * ready: hatched or 100%.
 */
export function EggFill({
  progress,
  raised,
  quoteSymbol,
  ready,
  variant = 'full',
  showLabel = true,
  className,
}: {
  progress: number;
  raised?: number | null;
  quoteSymbol: string;
  ready: boolean;
  variant?: Variant;
  showLabel?: boolean;
  className?: string;
}) {
  const p = clamp(progress);
  const { canvas, runner } = useMotion(() => fillSpec(p, variant, showLabel), { autoplay: 'run' });
  const prev = useRef<{ p: number; raised: number | null | undefined }>({ p, raised });

  useEffect(() => {
    const r = runner.current;
    if (!r) return;
    const S = r.S;
    const before = prev.current;
    S.target = p;
    if (ready && !S.ready) S.flash = 1;
    S.ready = ready;
    // A buy landed since the last poll: pour + ripple, and the real amount when we have it.
    if (p > before.p + 1e-9) {
      S.rip = 1;
      const delta = raised != null && before.raised != null ? raised - before.raised : null;
      if (delta && delta > 0) S.floaters.push({ t: S.t, txt: `+${delta < 0.01 ? delta.toPrecision(2) : delta.toFixed(delta < 1 ? 3 : 2)} ${quoteSymbol}`, side: S.floaters.length % 2 ? 1 : -1 });
    }
    prev.current = { p, raised };
    r.refresh();
  }, [p, raised, ready, quoteSymbol, runner]);

  return <canvas ref={canvas} role="img" aria-label={ready ? 'Ready to hatch' : pctLabel(p)} className={cn('block', className)} />;
}
