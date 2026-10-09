// Hatch burst (lab specimen 1): the egg squashes, cracks, the shell flies, the chick pops with confetti.
// Plays once as an overlay; the double chirp sounds at the pop. Client only (see ./index).
import { useState } from 'react';
import { CHICK, EGG, HEX, P, assign, bgGrid, cells, clamp, disc, drawDots, drawParts, emit, mix, pool, rng, zig, type Dot, type Scene } from '@/lib/motion/engine';
import type { Spec } from '@/lib/motion/runner';
import { playChirpDouble } from '@/lib/motion/sound';
import { useMotion } from '@/lib/motion/useMotion';
import { cn } from '@/lib/utils';

type S = Scene & { egg: Dot[]; chick: Dot[]; rays: number; crackAt: number | null; broken: boolean };

export const burstSpec = (): Spec<S> => ({
  dur: 3.8,
  setup(S) {
    S.egg = pool(80);
    S.chick = pool(40, 0, 2.6);
    assign(S, S.egg, cells(EGG), { instant: true });
    S.rays = 0;
    S.crackAt = null;
    S.broken = false;
  },
  events: [
    [0.86, (S) => void (S.crackAt = S.t)],
    [
      1.18,
      (S) => {
        S.broken = true;
        S.shake = 1;
        S.rays = 1;
        playChirpDouble(0.4); // the pop
        const R = rng(3);
        for (const d of S.egg) {
          if (d.gy < 0) continue;
          if (d.gy < zig(d.gx)) {
            d.free = true;
            d.g = 16;
            d.drag = 0.6;
            d.vx = d.x * 0.9 + (R() - 0.5) * 2.4 - 1.2;
            d.vy = -7 - R() * 3.5;
            d.life = 1.6;
            d.tgl = 0.6;
          } else {
            d.ty += 0.7;
            d.tcol = mix(d.tcol, P.ash, 0.35);
          }
        }
        for (let i = 0; i < 46; i++) {
          const a = R() * Math.PI * 2;
          const s = 4 + R() * 9;
          emit(S, { x: 0, y: -0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, g: 14, drag: 0.8, life: 0.9 + R() * 0.8, r: 0.18 + R() * 0.16, c: [P.yolk, P.ember, P.shell][i % 3], sq: i % 2 === 0, vr: (R() - 0.5) * 20, gl: 0.8 });
        }
      },
    ],
    [1.3, (S) => assign(S, S.chick, cells(CHICK, { scale: 1.05, oy: -0.6 }), { delay: (t) => clamp((3 - t.y) / 6) * 0.28, k: 260, damp: 13, gl: 0.15 })],
    [
      2.35,
      (S) => {
        const e = S.chick.find((d) => d.ch === 'N');
        if (e) e.tcol = [...P.shell];
      },
    ],
    [
      2.47,
      (S) => {
        const e = S.chick.find((d) => d.ch === 'N');
        if (e) e.tcol = [...P.night];
      },
    ],
    [2.7, (S) => S.chick.forEach((d) => d.a > 0.1 && (d.vy -= 7))],
    [3.05, (S) => S.chick.forEach((d) => d.a > 0.1 && (d.vy -= 5))],
  ],
  update(S, dt) {
    S.rays *= Math.pow(0.25, dt);
  },
  draw(ctx, G, S) {
    const t = S.t;
    if (S.rays > 0.01) {
      ctx.save();
      ctx.translate(G.cx, G.cy);
      ctx.rotate(t * 0.6);
      for (let i = 0; i < 10; i++) {
        ctx.rotate((Math.PI * 2) / 10);
        const gr = ctx.createLinearGradient(0, 0, G.R * 1.4, 0);
        gr.addColorStop(0, `rgba(242,169,59,${0.28 * S.rays})`);
        gr.addColorStop(1, 'rgba(242,169,59,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(G.R * 1.5, -G.R * 0.12);
        ctx.lineTo(G.R * 1.5, G.R * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    disc(ctx, G, S.broken ? 18 * S.rays : 0);
    bgGrid(ctx, G);
    ctx.save();
    if (!S.broken) {
      const ramp = clamp(t / 0.86);
      const sq = Math.sin(t * 26) * 0.06 * ramp;
      ctx.translate(G.cx, G.cy + 5 * G.cell);
      ctx.rotate(Math.sin(t * 19) * 0.05 * ramp);
      ctx.scale(1 - sq * 0.5, 1 + sq);
      ctx.translate(-G.cx, -(G.cy + 5 * G.cell));
    }
    drawDots(ctx, G, S.chick);
    drawDots(ctx, G, S.egg);
    if (S.crackAt !== null && !S.broken) {
      const p = clamp((t - S.crackAt) / 0.3);
      ctx.strokeStyle = HEX.ember;
      ctx.lineWidth = G.cell * 0.22;
      ctx.lineJoin = 'round';
      ctx.shadowColor = HEX.ember;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let x = 0; x <= 10 * p; x++) {
        const px = G.cx + (x - 5) * G.cell;
        const py = G.cy + (zig(x) - 5.5) * G.cell;
        if (x === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    drawParts(ctx, G, S);
  },
});

/**
 * Full-card overlay: plays the burst once over a dark scrim, then fades away and calls onDone.
 * Reduced motion: the settled frame (chick out) shows briefly with no motion, then it goes.
 */
export function HatchBurst({ onDone, className }: { onDone?: () => void; className?: string }) {
  const [leaving, setLeaving] = useState(false);
  const { canvas, runner } = useMotion(burstSpec, {
    autoplay: 'play',
    onEnd: () => {
      const reduced = runner.current?.reduced;
      setTimeout(() => setLeaving(true), reduced ? 900 : 250);
      setTimeout(() => onDone?.(), reduced ? 900 : 700);
    },
  });
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 z-20 bg-night/75 transition-opacity duration-500 motion-reduce:transition-none', leaving && 'opacity-0', className)}>
      <canvas ref={canvas} className="absolute left-1/2 top-1/2 aspect-square w-[min(100%,640px)] max-h-full -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}
