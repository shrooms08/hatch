// Canvas dot engine, ported from design/motion/hatch-motion-lab.html (the reference: same physics,
// timings and colours). Every dot is a small body on Hatch's 11x11 grid: it springs to a target, or flies
// free with gravity and drag, and eases its radius, alpha, colour and glow.
// Pure canvas + math; no React here (see ./runner for the loop and lifecycle).

export type RGB = [number, number, number];

export const HEX = {
  night: '#120E0B',
  disc: '#1A1511',
  ring: '#3A2F27',
  dim: '#2C241E',
  dim2: '#4A3E34',
  shell: '#F6EEDC',
  yolk: '#F2A93B',
  ember: '#E8572A',
  ash: '#8A8178',
} as const;

const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const P = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, rgb(v)])) as Record<keyof typeof HEX, RGB>;
export const MAP: Record<string, RGB> = { S: P.shell, Y: P.yolk, E: P.ember, A: P.ash, N: P.night };
export const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Shapes exactly as in the lab (its chicken, egg and the small chick that peeks out).
export const CHICKEN = ['......EE...', '.....SSSS..', '.....SSNSYY', 'S....SSSS..', 'SS..SSSSS..', 'SSSSSSSSS..', 'SSSSSSSSS..', '.SSSSSSSS..', '..SSSSSS...', '...Y..Y....', '..YY.YY....'];
export const EGG = ['....SSS....', '...SSSSS...', '..SSSSSSS..', '..SSSSSSS..', '.SSSYYYSSS.', '.SSYYYYYSS.', '.SSYYYYYSS.', '.SSSYYYSSS.', '..SSSSSSS..', '...SSSSS...', '....SSS....'];
export const CHICK = ['..EE...', '.SSSS..', '.SSNSYY', 'SSSSS..', 'SSSSS..', '.SSS...', '.Y.Y...'];

export const at = (s: string[], x: number, y: number) => (y >= 0 && y < s.length && x >= 0 && x < s[0].length ? s[y][x] : '.');

export type Cell = { gx: number; gy: number; ch: string; x: number; y: number; c: RGB; r?: number; gl?: number };
export function cells(shape: string[], { scale = 1, ox = 0, oy = 0 }: { scale?: number; ox?: number; oy?: number } = {}): Cell[] {
  const n = shape.length;
  const m = shape[0].length;
  const out: Cell[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < m; x++) {
      const ch = shape[y][x];
      if (ch === '.') continue;
      out.push({ gx: x, gy: y, ch, x: (x - (m - 1) / 2) * scale + ox, y: (y - (n - 1) / 2) * scale + oy, c: MAP[ch] });
    }
  return out;
}

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeIn = (t: number) => t * t;
export const easeBack = (t: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** Seeded LCG (same constants as the lab), so bursts look the same every time. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- dot physics ----------

type Pending = { tx: number; ty: number; tcol: RGB; tr: number; ta: number; k: number; damp: number; gx: number; gy: number; ch: string; tgl: number };

export class Dot {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  tx: number;
  ty: number;
  r = 0;
  tr = 0;
  a = 0;
  ta = 0;
  col: RGB = [...P.shell];
  tcol: RGB = [...P.shell];
  k = 170;
  damp = 15;
  free = false;
  g = 0;
  drag = 0;
  gl = 0;
  tgl = 0;
  pend: Pending | null = null;
  when = 0;
  gx = -1;
  gy = -1;
  ch = '.';
  life = Infinity;
  home = 0;
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.tx = x;
    this.ty = y;
  }
}

export const pool = (n: number, x = 0, y = 0) => Array.from({ length: n }, () => new Dot(x, y));

/** Base scene state shared by every animation (the lab's S). */
export type Scene = { t: number; parts: Particle[]; shake: number; fired: number; G?: Geom };

/** Greedy nearest-target morph: each target takes the closest free dot; leftovers fade out. */
export function assign(
  S: Scene,
  dots: Dot[],
  targets: Cell[],
  { delay = () => 0, k = 170, damp = 15, instant = false, r = 0.36, gl = 0 }: { delay?: (t: { x: number; y: number }) => number; k?: number; damp?: number; instant?: boolean; r?: number; gl?: number } = {}
) {
  const free = dots.slice();
  const used = new Set<number>();
  for (const t of targets) {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < free.length; i++) {
      if (used.has(i)) continue;
      const d = free[i];
      const px = d.pend ? d.pend.tx : d.tx;
      const py = d.pend ? d.pend.ty : d.ty;
      const dd = (px - t.x) ** 2 + (py - t.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best < 0) break;
    used.add(best);
    const d = free[best];
    const p: Pending = { tx: t.x, ty: t.y, tcol: [...t.c], tr: t.r ?? r, ta: 1, k, damp, gx: t.gx, gy: t.gy, ch: t.ch, tgl: t.gl ?? gl };
    if (instant) Object.assign(d, p, { x: t.x, y: t.y, vx: 0, vy: 0, r: p.tr, a: 1, col: [...t.c], free: false, pend: null });
    else {
      d.pend = p;
      d.when = S.t + delay(t);
    }
  }
  free.forEach((d, i) => {
    if (used.has(i)) return;
    const p: Pending = { tx: d.tx, ty: d.ty, tcol: d.tcol, tr: 0, ta: 0, k, damp, gx: -1, gy: -1, ch: '.', tgl: 0 };
    if (instant) Object.assign(d, p, { a: 0, r: 0, pend: null });
    else {
      d.pend = p;
      d.when = S.t + delay({ x: d.x, y: d.y });
    }
  });
}

export function stepDots(S: Scene, dots: Dot[], dt: number) {
  for (const d of dots) {
    if (d.pend && S.t >= d.when) {
      Object.assign(d, d.pend);
      d.free = false;
      d.pend = null;
    }
    if (d.free) {
      d.vy += d.g * dt;
      d.vx *= 1 - d.drag * dt;
      d.vy *= 1 - d.drag * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      if (d.life < 0.5) d.ta = 0;
    } else {
      const ax = (d.tx - d.x) * d.k - d.vx * d.damp;
      const ay = (d.ty - d.y) * d.k - d.vy * d.damp;
      d.vx += ax * dt;
      d.vy += ay * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    const e = Math.min(1, dt * 12);
    d.r += (d.tr - d.r) * e;
    d.a += (d.ta - d.a) * Math.min(1, dt * 9);
    d.col = mix(d.col, d.tcol, Math.min(1, dt * 10));
    d.gl += (d.tgl - d.gl) * e;
  }
}

export function drawDots(ctx: CanvasRenderingContext2D, G: Geom, dots: Dot[]) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of dots) {
    if (d.a < 0.02 || d.gl < 0.02 || d.r < 0.02) continue;
    const px = G.cx + d.x * G.cell;
    const py = G.cy + d.y * G.cell;
    const gr = ctx.createRadialGradient(px, py, 0, px, py, d.r * G.cell * 3.4);
    gr.addColorStop(0, `rgba(${d.col[0] | 0},${d.col[1] | 0},${d.col[2] | 0},${0.35 * d.gl * d.a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(px, py, d.r * G.cell * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  for (const d of dots) {
    if (d.a < 0.02 || d.r < 0.02) continue;
    ctx.globalAlpha = Math.min(1, d.a);
    ctx.fillStyle = css(d.col);
    ctx.beginPath();
    ctx.arc(G.cx + d.x * G.cell, G.cy + d.y * G.cell, d.r * G.cell, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- loose particles ----------

export type Particle = { x: number; y: number; vx: number; vy: number; g: number; drag: number; life: number; max: number; r: number; c: RGB; c2: RGB | null; sq: boolean; rot: number; vr: number; gl: number };

export function emit(S: Scene, o: Partial<Particle>) {
  S.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, max: 1, r: 0.2, c: P.yolk, c2: null, sq: false, rot: 0, vr: 0, gl: 0.6 }, o, { max: o.life || 1 }));
}

export function stepParts(S: Scene, dt: number) {
  S.parts = S.parts.filter((p) => {
    p.vy += p.g * dt;
    p.vx *= 1 - p.drag * dt;
    p.vy *= 1 - p.drag * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
    return p.life > 0;
  });
}

export function drawParts(ctx: CanvasRenderingContext2D, G: Geom, S: Scene) {
  for (const p of S.parts) {
    const k = p.life / p.max;
    const c = p.c2 ? mix(p.c2, p.c, k) : p.c;
    const px = G.cx + p.x * G.cell;
    const py = G.cy + p.y * G.cell;
    const r = p.r * G.cell * (0.4 + 0.6 * k);
    if (p.gl > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 * k * p.gl;
      ctx.fillStyle = css(c);
      ctx.beginPath();
      ctx.arc(px, py, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = Math.min(1, k * 1.4);
    ctx.fillStyle = css(c);
    if (p.sq) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- scene helpers ----------

export type Geom = { w: number; h: number; cx: number; cy: number; R: number; cell: number };
export function geom(w: number, h: number): Geom {
  const R = Math.min(w, h) * 0.4;
  const cell = (R * 2) / 13.5;
  return { w, h, cx: w / 2, cy: h * 0.47, R, cell };
}

export function disc(ctx: CanvasRenderingContext2D, G: Geom, glow = 0, glowCol: string = HEX.yolk) {
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = glowCol;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = HEX.disc;
  ctx.beginPath();
  ctx.arc(G.cx, G.cy, G.R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const lw = Math.max(1.5, G.R * 0.022);
  ctx.lineWidth = lw;
  ctx.strokeStyle = glow > 0 ? glowCol : HEX.ring;
  ctx.globalAlpha = glow > 0 ? clamp(0.35 + glow / 30) : 1;
  ctx.beginPath();
  ctx.arc(G.cx, G.cy, Math.max(0, G.R - lw), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function bgGrid(ctx: CanvasRenderingContext2D, G: Geom) {
  ctx.fillStyle = HEX.dim;
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 11; x++) {
      ctx.beginPath();
      ctx.arc(G.cx + (x - 5) * G.cell, G.cy + (y - 5) * G.cell, G.cell * 0.27, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** The app's fonts for canvas text (next/font exposes them as CSS variables on :root). */
export function fontFamily(kind: 'mono' | 'display'): string {
  const fallback = kind === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'system-ui, sans-serif';
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(kind === 'mono' ? '--font-geist-mono' : '--font-unbounded').trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = '700', family = fontFamily('mono'), a = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}

export const belowY = (G: Geom) => G.cy + G.R + (G.h - G.cy - G.R) / 2;

export function shake(ctx: CanvasRenderingContext2D, S: Scene) {
  if (S.shake > 0.001 && S.G) {
    const a = S.shake * S.G.cell * 0.6;
    ctx.translate((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
  }
}

// ---------- dot-matrix digits (3x5) ----------
// The lab's digits, plus the few characters real stats need ("-" while loading, ",", "K", "M", "B").
export const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  $: ['011', '110', '010', '011', '110'],
  '%': ['101', '001', '010', '100', '101'],
  '.': ['000', '000', '000', '000', '010'],
  ',': ['000', '000', '000', '010', '100'],
  '-': ['000', '000', '111', '000', '000'],
  K: ['101', '101', '110', '101', '101'],
  M: ['101', '111', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
};

export function glyph(ctx: CanvasRenderingContext2D, ch: string, ox: number, oy: number, cell: number, color: string, dimCol: string = HEX.dim, dy = 0, clipTop: number | null = null, clipBot: number | null = null) {
  const gl = FONT[ch];
  if (!gl) return;
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      const py = oy + (y - 2) * cell + dy;
      if (clipTop !== null && clipBot !== null && (py < clipTop || py > clipBot)) continue;
      const on = gl[y][x] === '1';
      ctx.fillStyle = on ? color : dimCol;
      ctx.beginPath();
      ctx.arc(ox + x * cell, py, cell * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** The lab's zigzag crack row (4 or 5 by column). */
export const zig = (x: number) => 4 + (x % 2);
