// Egg fill (lab specimen 2): the egg fills to the pool's REAL bonding-curve progress. It starts at the true
// value (no fake fill-up); when the poll shows the reserve grew, the level pours up with a ripple and a
// "+X SOL" floater for the real amount. Cracks and glow past 80%, "Ready to hatch" at 100%.
import { useEffect, useRef } from 'react';
import { EGG, HEX, P, at, bgGrid, belowY, clamp, css, disc, drawParts, emit, mix, text, type Scene } from '@/lib/motion/engine';
import type { Spec } from '@/lib/motion/runner';
import { useMotion } from '@/lib/motion/useMotion';
import { cn } from '@/lib/utils';

type Floater = { t: number; txt: string; side: number };
type S = Scene & { L: number; target: number; vel: number; rip: number; floaters: Floater[]; bub: number; flash: number; ready: boolean; label: string | null };

const CRACKS: [number, number][][] = [
  [[5, 0.5], [4.6, 1.4], [5.3, 2.2], [4.8, 3.1]],
  [[3.2, 2.5], [3.9, 3.0], [3.5, 3.7]],
  [[6.9, 2.4], [6.3, 3.0], [6.8, 3.8]],
];

const fillSpec = (initial: number, showLabel: boolean): Spec<S> => ({
  dur: Infinity,
  setup(S) {
    S.L = initial;
    S.target = initial;
    S.vel = 0;
    S.rip = 0;
    S.floaters = [];
    S.bub = 0;
    S.flash = 0;
    S.ready = false;
    S.label = null;
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
    S.bub += dt * (3 + S.L * 8);
    while (S.bub > 1) {
      S.bub -= 1;
      const x = Math.random() * 5 - 2.5;
      emit(S, { x, y: 4.3, vx: (Math.random() - 0.5) * 0.4, vy: -2.2 - Math.random() * 1.5, life: 2.2, r: 0.11 + Math.random() * 0.08, c: [255, 214, 140], gl: 0.5 });
    }
    const surf = 5.5 - clamp(S.L) * 11.2;
    S.parts = S.parts.filter((p) => p.y > surf + 0.2);
  },
  draw(ctx, G, S) {
    const t = S.t;
    const L = clamp(S.L);
    disc(ctx, G, S.ready ? 14 + S.flash * 20 : 0);
    bgGrid(ctx, G);
    const inEgg = (x: number, y: number) => at(EGG, x, y) !== '.';
    const crack = clamp((L - 0.8) / 0.2);
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 11; x++) {
        if (!inEgg(x, y)) continue;
        const px = G.cx + (x - 5) * G.cell;
        const py = G.cy + (y - 5) * G.cell;
        const edge = !inEgg(x - 1, y) || !inEgg(x + 1, y) || !inEgg(x, y - 1) || !inEgg(x, y + 1);
        if (edge) {
          let j = 0;
          if (crack > 0 && y < 5) j = (Math.random() - 0.5) * 0.06 * G.cell * crack;
          ctx.fillStyle = HEX.shell;
          ctx.beginPath();
          ctx.arc(px + j, py + j, G.cell * 0.36, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const surf = 5.5 - L * 11.2 + Math.sin(x * 0.9 + t * 6) * (0.18 + 0.55 * S.rip) + Math.sin(x * 1.7 - t * 3.3) * 0.12;
        const f = clamp(y + 0.5 - surf);
        const c = mix(P.dim2, P.yolk, f);
        if (f > 0.05) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(242,169,59,${0.16 * f})`;
          ctx.beginPath();
          ctx.arc(px, py, G.cell * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.arc(px, py, G.cell * (0.32 + 0.05 * f), 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.save();
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R * 0.95, 0, Math.PI * 2);
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
      text(ctx, f.txt, G.cx + f.side * G.R * 0.62, G.cy - G.R * 0.15 - age * G.cell * 2.2, Math.max(10, G.cell * 0.62), HEX.yolk, '700', undefined, 1 - age / 1.1);
    });
    // The card already shows the % next to the egg; the egg itself announces the end state.
    if (showLabel && S.ready) text(ctx, 'Ready to hatch', G.cx, belowY(G), Math.max(13, G.cell * 0.95), HEX.yolk);
  },
});

const pctLabel = (p: number) => `${p < 0.01 ? (p * 100).toFixed(2) : Math.floor(p * 100)}% to hatch`;

/**
 * progress: 0..1 from the pool. raised: the quote reserve (UI amount) from the same poll, for the "+X" floater.
 * ready: hatched or 100%.
 */
export function EggFill({ progress, raised, quoteSymbol, ready, showLabel = true, className }: { progress: number; raised?: number | null; quoteSymbol: string; ready: boolean; showLabel?: boolean; className?: string }) {
  const p = clamp(progress);
  const { canvas, runner } = useMotion(() => fillSpec(p, showLabel), { autoplay: 'run' });
  const prev = useRef<{ p: number; raised: number | null | undefined }>({ p, raised });

  useEffect(() => {
    const r = runner.current;
    if (!r) return;
    const S = r.S;
    const before = prev.current;
    S.target = p;
    S.label = pctLabel(p);
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
