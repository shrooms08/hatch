// Stats ticker (lab specimen 6): a value in dot digits that rolls like a slot machine and lands with a glow
// when it scrolls into view (and again when the real value changes). Dashes while loading.
import { useEffect, useRef } from 'react';
import { HEX, clamp, glyph, type Geom, type Scene } from '@/lib/motion/engine';
import type { Spec } from '@/lib/motion/runner';
import { useMotion } from '@/lib/motion/useMotion';
import { cn } from '@/lib/utils';

type S = Scene & { value: string; landedAt: number | null; rolling: boolean };

const ROLL = 1.5; // seconds per digit roll (lab)

const tickerSpec = (accent: boolean): Spec<S> => ({
  dur: 3.2,
  geom: (w, h): Geom => ({ w, h, cx: w / 2, cy: h / 2, R: 0, cell: 0 }),
  setup(S) {
    S.value = '';
    S.landedAt = null;
    S.rolling = false;
  },
  settle(S) {
    S.t = 99;
    S.landedAt = -99;
  },
  draw(ctx, G, S) {
    const val = S.value || '---';
    // 3x5 glyphs, 4 cells per char: fit the box (left aligned, like the stat text it replaces).
    const cell = Math.min((G.h * 0.9) / 5.5, G.w / (4 * val.length));
    const cy = G.h / 2;
    const gw = (4 * val.length - 1) * cell;
    let ox = cell * 0.5;
    let landed = true;
    const t = S.rolling ? S.t : 99;
    for (let i = 0; i < val.length; i++) {
      const ch = val[i];
      if (!/[0-9]/.test(ch)) {
        glyph(ctx, ch, ox, cy, cell, HEX.ash);
        ox += 4 * cell;
        continue;
      }
      const target = +ch;
      const laps = 2 + i;
      const p = clamp((t - 0.25 - i * 0.12) / ROLL);
      if (p < 1) landed = false;
      const e = 1 - Math.pow(1 - p, 4);
      const pos = target + 10 * laps * (1 - e);
      const base = Math.floor(pos);
      const frac = pos - base;
      const dA = ((base % 10) + 10) % 10;
      const dB = (dA + 1) % 10;
      const top = cy - 2.6 * cell;
      const bot = cy + 2.6 * cell;
      const shift = frac * 5.5 * cell;
      const col = p >= 1 && accent ? HEX.yolk : HEX.shell;
      glyph(ctx, String(dA), ox, cy, cell, col, HEX.dim, shift, top, bot);
      if (frac > 0.01) glyph(ctx, String(dB), ox, cy, cell, col, HEX.dim, shift - 5.5 * cell, top, bot);
      ox += 4 * cell;
    }
    if (landed && S.value && S.rolling) {
      if (S.landedAt === null) S.landedAt = S.t;
      const age = S.t - S.landedAt;
      if (age < 0.8) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gx = cell * 0.5 + gw / 2;
        const gr = ctx.createRadialGradient(gx, cy, 0, gx, cy, gw);
        gr.addColorStop(0, `rgba(242,169,59,${0.35 * (1 - age / 0.8)})`);
        gr.addColorStop(1, 'rgba(242,169,59,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, G.w, G.h);
        ctx.restore();
      }
    }
  },
});

/** `value` is the real, formatted stat ("12", "48", "$761"); null/undefined while loading (dashes). */
export function DotNumber({ value, accent = false, label, className }: { value: string | null | undefined; accent?: boolean; label: string; className?: string }) {
  const { canvas, runner } = useMotion(() => tickerSpec(accent));
  const seen = useRef(false);
  const shown = useRef<string | null>(null);

  // Roll when it first scrolls into view with a value, and whenever the real value changes after that.
  useEffect(() => {
    const el = canvas.current;
    const r = runner.current;
    if (!el || !r) return;
    const start = () => {
      if (!value || shown.current === value) return;
      shown.current = value;
      r.play();
      r.S.value = value;
      r.S.rolling = true;
      r.refresh();
    };
    if (!value) {
      r.S.value = '';
      r.refresh();
      return;
    }
    if (seen.current) return start();
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        seen.current = true;
        io.disconnect();
        start();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value, canvas, runner]);

  return (
    <span className={cn('relative block', className)}>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <span className="sr-only">
        {label}: {value ?? 'loading'}
      </span>
    </span>
  );
}
