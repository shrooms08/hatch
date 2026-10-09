// Sniper shield (lab specimen 5): bots smash into the shield and pay, the fee falls, buyers slip through.
// `feeAt` is the fee in % at scene time t: the lab's illustrative curve on the launch form, or the pool's
// real fee scheduler (wall clock since activation) on a live v2 token page.
import { EGG, HEX, P, belowY, cells, clamp, css, drawDots, drawParts, emit, glyph, mix, pool, text, type Dot, type Scene } from '@/lib/motion/engine';
import type { Spec } from '@/lib/motion/runner';
import { useMotion } from '@/lib/motion/useMotion';
import { cn } from '@/lib/utils';

type Actor = { t0: number; ang: number; type: 'b' | 'u'; state: 'in' | 'out' | 'done'; r: number; v: number; spin: number; rot: number; vr?: number; through?: boolean };
type S = Scene & { ring: Dot[]; Rr: number; hits: { t: number; ang: number; type: 'b' | 'u' }[]; joined: number; eggS: number; eggV: number; pops: { t: number; ang: number; txt: string }[]; actors: Actor[] };

/** The lab's illustration: 50% falling to 1% over 4.4 s (same exponential shape as the v2 schedule). */
export const illustrativeFee = (t: number) => 50 * Math.pow(0.02, clamp((t - 0.4) / 4.4));

const shieldSpec = (feeAt: (t: number) => number): Spec<S> => ({
  dur: 7.0,
  dotSets: (S) => [S.ring],
  setup(S) {
    const n = 48;
    S.ring = pool(n);
    S.Rr = 4.25;
    S.ring.forEach((d, i) => {
      const a = (i / n) * Math.PI * 2;
      Object.assign(d, { home: a, x: Math.cos(a) * S.Rr, y: Math.sin(a) * S.Rr, tx: Math.cos(a) * S.Rr, ty: Math.sin(a) * S.Rr, a: 1, ta: 1, r: 0.22, tr: 0.22, col: [...P.yolk], tcol: [...P.yolk], gl: 0.7, tgl: 0.7, k: 120, damp: 9 });
    });
    S.hits = [];
    S.joined = 0;
    S.eggS = 0.46;
    S.eggV = 0;
    S.pops = [];
    const plan: [number, number, 'b' | 'u'][] = [[0.3, 0.25, 'b'], [0.85, 2.2, 'b'], [1.35, 4.0, 'b'], [1.85, 1.2, 'b'], [2.35, 5.3, 'b'], [2.9, 3.1, 'b'], [3.9, 0.75, 'u'], [4.4, 2.6, 'u'], [4.9, 4.5, 'u'], [5.4, 5.8, 'u']];
    S.actors = plan.map(([t0, ang, type]) => ({ t0, ang, type, state: 'in', r: 7.6, v: 5.2, spin: 0, rot: 0 }));
  },
  update(S, dt) {
    const t = S.t;
    const fee = feeAt(t);
    const strength = clamp((fee - 1) / 49);
    S.ring.forEach((d) => {
      let rr = S.Rr + Math.sin(t * 3 + d.home * 5) * 0.06 * (1 - strength);
      let da = 0;
      for (const h of S.hits) {
        const age = t - h.t;
        if (age < 0 || age > 1.2) continue;
        const dA = Math.atan2(Math.sin(d.home - h.ang), Math.cos(d.home - h.ang));
        const fall = Math.exp(-(dA * dA) / 0.09) * Math.exp(-age * 4);
        if (h.type === 'b') rr -= 0.9 * fall * Math.cos(age * 14);
        else da += Math.sign(dA || 1) * 0.35 * Math.exp(-(dA * dA) / 0.05) * Math.exp(-age * 3);
      }
      const a = d.home + da;
      d.tx = Math.cos(a) * rr;
      d.ty = Math.sin(a) * rr;
      d.tcol = mix(P.dim2, P.yolk, 0.25 + 0.75 * strength);
      d.tgl = 0.15 + 0.7 * strength;
    });
    for (const A of S.actors) {
      if (t < A.t0) continue;
      if (A.state === 'in') {
        A.r -= A.v * dt;
        const pass = A.type === 'u' || feeAt(t) < 4;
        if (!pass && A.r <= S.Rr + 0.3) {
          A.state = 'out';
          A.vr = 6.5;
          A.spin = (Math.random() < 0.5 ? -1 : 1) * 9;
          S.hits.push({ t, ang: A.ang, type: 'b' });
          S.shake = 0.5;
          S.pops.push({ t, ang: A.ang, txt: `paid ${feeAt(t).toFixed(0)}%` });
          for (let i = 0; i < 10; i++) {
            const a = A.ang + (Math.random() - 0.5) * 1.4;
            emit(S, { x: Math.cos(A.ang) * S.Rr, y: Math.sin(A.ang) * S.Rr, vx: Math.cos(a) * (4 + Math.random() * 4), vy: Math.sin(a) * (4 + Math.random() * 4), drag: 3, life: 0.5, r: 0.14, c: P.ember, gl: 1 });
          }
        }
        if (pass && A.type === 'u' && !A.through && A.r <= S.Rr + 0.6) {
          A.through = true;
          S.hits.push({ t, ang: A.ang, type: 'u' });
        }
        if (A.type === 'u' && A.r <= 0.4) {
          A.state = 'done';
          S.joined++;
          S.eggV += 1.6;
        }
      } else if (A.state === 'out') {
        A.r += (A.vr ?? 0) * dt;
        A.vr = (A.vr ?? 0) * Math.pow(0.6, dt);
        A.rot += A.spin * dt;
        if (A.r > 9) A.state = 'done';
      }
    }
    const a = (0.46 + S.joined * 0.035 - S.eggS) * 160 - S.eggV * 10;
    S.eggV += a * dt;
    S.eggS += S.eggV * dt;
  },
  draw(ctx, G, S) {
    const t = S.t;
    const fee = feeAt(t);
    ctx.fillStyle = HEX.disc;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    cells(EGG, { scale: S.eggS }).forEach((c) => {
      ctx.fillStyle = css(c.ch === 'Y' ? mix(P.yolk, [255, 225, 160], clamp(S.joined / 4)) : c.c);
      ctx.beginPath();
      ctx.arc(G.cx + c.x * G.cell, G.cy + c.y * G.cell, G.cell * 0.36 * S.eggS * 1.05, 0, Math.PI * 2);
      ctx.fill();
    });
    drawDots(ctx, G, S.ring);
    drawParts(ctx, G, S);
    for (const A of S.actors) {
      if (t < A.t0 || A.state === 'done') continue;
      const jit = A.type === 'b' ? Math.sin(t * 20 + A.t0 * 9) * 0.12 : 0;
      const x = Math.cos(A.ang + jit * 0.05) * A.r;
      const y = Math.sin(A.ang + jit * 0.05) * A.r;
      const px = G.cx + x * G.cell;
      const py = G.cy + y * G.cell;
      if (A.type === 'b') {
        const s = G.cell * 0.3;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(A.rot + A.ang);
        ctx.globalAlpha = A.state === 'out' ? clamp(1 - (A.r - S.Rr) / 4) : 1;
        for (let gy = 0; gy < 3; gy++)
          for (let gx = 0; gx < 3; gx++) {
            ctx.fillStyle = gy === 1 && gx !== 1 ? HEX.ember : HEX.ash;
            ctx.fillRect((gx - 1.5) * s, (gy - 1.5) * s, s * 0.86, s * 0.86);
          }
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(242,169,59,.35)';
        ctx.beginPath();
        ctx.arc(px, py, G.cell * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = HEX.yolk;
        ctx.beginPath();
        ctx.arc(px, py, G.cell * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    S.pops.forEach((p) => {
      const age = t - p.t;
      if (age > 0.9) return;
      const r = S.Rr + 1.2 + age * 1.5;
      text(ctx, p.txt, G.cx + Math.cos(p.ang) * r * G.cell, G.cy + Math.sin(p.ang) * r * G.cell, Math.max(9, G.cell * 0.55), HEX.ember, '700', undefined, 1 - age / 0.9);
    });
    const y = belowY(G);
    const str = `${fee < 10 ? fee.toFixed(1) : fee.toFixed(0)}%`;
    const cell = Math.max(2.4, G.cell * 0.24);
    const gw = (4 * str.length - 1) * cell;
    let ox = G.cx - gw / 2 - G.cell * 2.2;
    for (const ch of str) {
      glyph(ctx, ch, ox, y, cell, fee > 4 ? HEX.ember : HEX.yolk);
      ox += 4 * cell;
    }
    text(ctx, fee > 4 ? 'bots pay' : 'buyers in', G.cx + G.cell * 2.6, y, Math.max(10, G.cell * 0.62), HEX.ash);
  },
});

/** Launch form explainer: the lab's illustration, looping while on screen. */
export function ShieldIllustration({ className }: { className?: string }) {
  const { canvas } = useMotion(() => shieldSpec(illustrativeFee), { autoplay: 'play', loopHold: 0.6 });
  return <canvas ref={canvas} role="img" aria-label="Illustration: bots hit the shield and pay a high fee; the fee falls from 50% to 1%; buyers pass." className={cn('block', className)} />;
}

/**
 * Live v2 token page: the same scene, with the fee from the pool's real scheduler at the current wall-clock
 * time (`feeNow()`), looping until the parent hides it after the first 60 seconds.
 */
export function ShieldLive({ feeNow, className }: { feeNow: () => number; className?: string }) {
  const { canvas } = useMotion(() => shieldSpec(() => feeNow()), { autoplay: 'play', loopHold: 0.6 });
  return <canvas ref={canvas} role="img" aria-label="Sniper shield is on: the live fee is falling to 1%." className={cn('block', className)} />;
}
