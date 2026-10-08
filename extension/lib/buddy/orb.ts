/**
 * The orb buddy renderer: one canvas.
 *
 * Base: the thinking orb from GLANCE (entrypoints/content/orb.ts), i.e. the `thinking-orbs` engine
 * (Jakub Antalik, MIT; see THIRD_PARTY_NOTICES.md) painted on a plain canvas, with GLANCE's
 * crossfade between engine states, 10 fps cap while resting (full rate on pecks and hover), pause while hidden, and a single still
 * frame for reduced motion. Recoloured to the Hatch palette and set inside a glassy Night body
 * with a state-coloured glow. On top: a figure of ~200 dots that morphs chicken <-> egg.
 */
import { MODE_FRAMES, resolvePreset, type OrbState, type Resolved } from "thinking-orbs/engine";
import { DOTS, ENGINE_LAYER, GLOW, PALETTE, SIZE, TIMING, type GlowState } from "./config";
import { CHICKEN, EGG, crackPoints, hash01, type Figure } from "./shapes";

export type BuddyState = "idle" | "noticed" | "thinking" | "ready";
type Shape = "chicken" | "egg";
type Phase = "rest" | "morph" | "crack" | "burst" | "reform";

const ENGINE_PRESET = 64; // thinking-orbs' avatar-scale preset
const CROSSFADE_S = 0.28; // GLANCE
const L = SIZE.docked * SIZE.canvasRatio; // logical canvas size
const C = L / 2; // orb centre
const R = SIZE.docked / 2; // orb radius
const F = R * SIZE.figureRatio; // figure radius

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const P = { night: hex(PALETTE.night), yolk: hex(PALETTE.yolk), ember: hex(PALETTE.ember), shell: hex(PALETTE.shell), ash: hex(PALETTE.ash) };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

type Dot = {
  x: number; y: number; // current (figure space)
  fx: number; fy: number; // morph from
  tx: number; ty: number; // morph to
  delay: number; // ms
  vx: number; vy: number; // burst velocity (figure units / s)
  accent: boolean;
  outline: boolean;
  head: boolean;
  meteor: boolean;
  crack: boolean;
  trail: [number, number][];
  seed: number;
};

export type OrbBuddyOptions = {
  reducedMotion?: boolean;
  onFps?: (fps: number) => void;
  /** Largest CSS size the orb is shown at (canvas resolution). Default: the hover size. */
  renderSize?: number;
};

export class OrbBuddy {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private reduced: boolean;
  private mq = window.matchMedia("(prefers-reduced-motion: reduce)");

  private state: BuddyState = "idle";
  private glowState: GlowState = "idle";
  private shape: Shape = "chicken";
  private phase: Phase = "rest";
  private phaseStart = 0;
  private phaseMs = 0;
  private stateSince = 0;
  private dots: Dot[];
  private glow = { color: [...P.yolk] as Rgb, strength: GLOW.idle.strength, flash: 0 };

  private engine: { state: OrbState; preset: Resolved; alpha: number };
  private enginePrev: { state: OrbState; preset: Resolved; alpha: number; until: number } | null = null;

  private raf = 0;
  private visible = true;
  private lastPaint = 0;
  private nextPeck = 0;
  private peckAt = -1e9;
  private hovered = false;
  private twinkle: { i: number; at: number }[] = [];
  private nextTwinkle = 0;
  private hatchQueue: (() => void)[] = [];
  private pendingState: BuddyState | null = null;
  private fpsFrames = 0;
  private fpsSince = 0;
  private destroyed = false;
  private onVisibility = () => (document.hidden ? this.stop() : this.start());
  private onMotionChange = () => {
    this.reduced = this.mq.matches;
    this.stop();
    this.start();
  };

  constructor(private opts: OrbBuddyOptions = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hatch-orb";
    this.canvas.setAttribute("aria-hidden", "true");
    // Render at the hover size so the 64 -> 80 px grow stays crisp.
    const px = Math.round((opts.renderSize ?? SIZE.hover) * SIZE.canvasRatio * this.dpr);
    this.canvas.width = this.canvas.height = px;
    this.ctx = this.canvas.getContext("2d");
    this.reduced = opts.reducedMotion ?? this.mq.matches;
    this.dots = this.makeDots(CHICKEN);
    const l = ENGINE_LAYER.idle;
    this.engine = { state: l.state, preset: resolvePreset(l.state, ENGINE_PRESET), alpha: l.alpha };
    document.addEventListener("visibilitychange", this.onVisibility);
    if (opts.reducedMotion === undefined) this.mq.addEventListener("change", this.onMotionChange);
    this.scheduleIdle(performance.now());
    this.start();
  }

  // ---------- public API ----------

  get currentState(): BuddyState {
    return this.state;
  }

  setState(next: BuddyState) {
    if (this.phase === "crack" || this.phase === "burst" || this.phase === "reform") {
      this.pendingState = next; // apply after the hatch sequence
      return;
    }
    if (next === this.state) return;
    const now = performance.now();
    this.state = next;
    this.stateSince = now;
    this.setGlow(next);
    this.setEngine(next);
    const wantShape: Shape = next === "idle" ? "chicken" : "egg";
    if (wantShape !== this.shape) this.morphTo(wantShape, now);
    this.kick();
  }

  /** launched / hatched: crack the egg, burst, reform the chicken. Resolves when done. */
  hatch(): Promise<void> {
    return new Promise((resolve) => {
      this.hatchQueue.push(resolve);
      if (this.hatchQueue.length > 1) return; // already running; resolve together
      const now = performance.now();
      if (this.reduced) {
        // Glow only: flash Ember, then settle on the still chicken.
        this.glow.flash = 1;
        this.glowState = "hatching";
        this.paintStill();
        window.setTimeout(() => this.finishHatch(), TIMING.crackMs + TIMING.burstMs + TIMING.reformMs);
        return;
      }
      if (this.shape !== "egg") {
        this.morphTo("egg", now, TIMING.morphMs * 0.6);
        this.phase = "morph";
        // crack starts when the morph finishes (see tick)
      } else this.startCrack(now);
      this.setEngine("hatching");
      this.kick();
    });
  }

  /** Pointer over the orb: animate at full rate while hovered. */
  setHover(v: boolean) {
    this.hovered = v;
    if (v) this.kick();
  }

  /** The host hides/shows the orb (e.g. "Hide on this site"): no frames while hidden. */
  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.start();
    else this.stop();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.mq.removeEventListener("change", this.onMotionChange);
    this.canvas.remove();
  }

  // ---------- figure ----------

  private makeDots(fig: Figure): Dot[] {
    const n = Math.min(DOTS.max, fig.dots.length);
    return fig.dots.slice(0, n).map((d, i) => ({
      x: d.x, y: d.y, fx: d.x, fy: d.y, tx: d.x, ty: d.y,
      delay: 0, vx: 0, vy: 0,
      accent: d.accent, outline: d.outline,
      head: d.part === "head" || d.part === "beak" || d.part === "comb",
      meteor: hash01(i, 7) < DOTS.meteorFraction,
      crack: false, trail: [], seed: hash01(i, 11),
    }));
  }

  private morphTo(shape: Shape, now: number, ms: number = TIMING.morphMs) {
    const fig = shape === "egg" ? EGG : CHICKEN;
    this.dots.forEach((d, i) => {
      const t = fig.dots[i]!;
      d.fx = d.x; d.fy = d.y;
      d.tx = t.x; d.ty = t.y;
      d.accent = t.accent;
      d.head = t.part === "head" || t.part === "beak" || t.part === "comb";
      d.outline = t.outline;
      d.crack = false;
      d.delay = d.meteor ? TIMING.morphJitterMs * (0.6 + 0.4 * d.seed) : TIMING.morphJitterMs * hash01(i, 5);
      d.trail = [];
    });
    this.shape = shape;
    this.phase = "morph";
    this.phaseStart = now;
    this.phaseMs = ms + TIMING.morphJitterMs;
  }

  private startCrack(now: number) {
    const pts = crackPoints(22);
    // The interior dots nearest the crack line become the crack.
    const byDist = this.dots
      .map((d, i) => ({ i, d: Math.abs(d.ty - pts[0]![1]) + (d.outline ? 0.5 : 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, pts.length)
      .sort((a, b) => this.dots[a.i]!.tx - this.dots[b.i]!.tx);
    this.dots.forEach((d) => {
      d.fx = d.x; d.fy = d.y;
      d.crack = false;
      // halves part a little: top up, bottom down
      d.tx = d.x; d.ty = d.y + (d.y < 0 ? -0.07 : 0.07);
      d.delay = 0;
    });
    byDist.forEach(({ i }, k) => {
      const d = this.dots[i]!;
      d.crack = true;
      d.tx = pts[k]![0];
      d.ty = pts[k]![1];
    });
    this.phase = "crack";
    this.phaseStart = now;
    this.phaseMs = TIMING.crackMs;
  }

  private startBurst(now: number) {
    const [cx, cy] = EGG.center;
    this.dots.forEach((d, i) => {
      const a = Math.atan2(d.y - cy, d.x - cx) + (hash01(i, 13) - 0.5) * 0.9;
      // drag (below) stops a dot after ~speed/2.8 figure units; the rim is ~1.7, so most fly past it
      const speed = 3.2 + 2.6 * hash01(i, 17);
      d.vx = Math.cos(a) * speed;
      d.vy = Math.sin(a) * speed;
      d.trail = [];
    });
    this.glowState = "hatching";
    this.glow.flash = 1;
    this.phase = "burst";
    this.phaseStart = now;
    this.phaseMs = TIMING.burstMs;
  }

  private startReform(now: number) {
    this.morphTo("chicken", now, TIMING.reformMs);
    this.phase = "reform";
    this.state = "idle";
    this.setGlow("idle");
    this.setEngine("idle");
  }

  private finishHatch() {
    this.phase = "rest";
    this.state = "idle";
    this.shape = "chicken";
    this.setGlow("idle");
    const done = this.hatchQueue.splice(0);
    done.forEach((r) => r());
    if (this.pendingState) {
      const s = this.pendingState;
      this.pendingState = null;
      this.setState(s);
    }
    if (this.reduced) this.paintStill();
  }

  // ---------- glow + engine ----------

  private setGlow(s: GlowState) {
    this.glowState = s;
  }

  private setEngine(s: GlowState) {
    const l = ENGINE_LAYER[s];
    if (l.state === this.engine.state && l.alpha === this.engine.alpha) return;
    const now = performance.now() / 1000;
    this.enginePrev = { ...this.engine, until: now + CROSSFADE_S };
    this.engine = { state: l.state, preset: resolvePreset(l.state, ENGINE_PRESET), alpha: l.alpha };
  }

  // ---------- loop ----------

  private kick() {
    if (this.reduced) this.paintStill();
    else this.start();
  }

  private start() {
    if (this.destroyed || this.raf || document.hidden || !this.visible) return;
    if (this.reduced) {
      this.paintStill();
      return;
    }
    const loop = (ms: number) => {
      this.raf = requestAnimationFrame(loop);
      // Resting (idle chicken, no transition): ~10 fps is enough for breathing. A peck or the
      // pointer over the orb get full frame rate so they stay smooth.
      const pecking = ms - this.peckAt < TIMING.peckMs;
      const resting = this.phase === "rest" && this.state === "idle" && !this.enginePrev && !pecking && !this.hovered;
      if (resting && ms - this.lastPaint < 1000 / TIMING.idleFps) return;
      this.lastPaint = ms;
      this.tick(ms);
      this.paint(ms);
      this.countFps(ms);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private countFps(ms: number) {
    if (!this.opts.onFps) return;
    this.fpsFrames++;
    if (ms - this.fpsSince >= 1000) {
      this.opts.onFps((this.fpsFrames * 1000) / (ms - this.fpsSince));
      this.fpsFrames = 0;
      this.fpsSince = ms;
    }
  }

  private scheduleIdle(now: number) {
    const [a, b] = TIMING.peckEveryMs;
    this.nextPeck = now + a + Math.random() * (b - a);
    this.nextTwinkle = now + TIMING.twinkleEveryMs * (0.5 + Math.random());
  }

  private tick(now: number) {
    const p = (now - this.phaseStart) / this.phaseMs;
    const dt = 1 / 60;

    if (this.phase === "morph" || this.phase === "reform" || this.phase === "crack") {
      const span = this.phase === "crack" ? this.phaseMs : this.phaseMs - TIMING.morphJitterMs;
      for (const d of this.dots) {
        const k = clamp01((now - this.phaseStart - d.delay) / span);
        const e = this.phase === "crack" ? easeOut(k) : easeInOut(k);
        const nx = d.fx + (d.tx - d.fx) * e;
        const ny = d.fy + (d.ty - d.fy) * e;
        if (d.meteor && k > 0 && k < 1) {
          d.trail.unshift([d.x, d.y]);
          d.trail.length = Math.min(d.trail.length, 6);
        } else if (k >= 1) d.trail = [];
        d.x = nx;
        d.y = ny;
      }
      if (p >= 1) {
        if (this.phase === "crack") this.startBurst(now);
        else if (this.phase === "reform") this.finishHatch();
        else if (this.hatchQueue.length) this.startCrack(now); // morph to egg before a hatch
        else this.phase = "rest";
      }
    } else if (this.phase === "burst") {
      const damp = Math.pow(0.06, dt); // strong drag: a pop, then a drift
      for (const d of this.dots) {
        d.trail.unshift([d.x, d.y]);
        d.trail.length = Math.min(d.trail.length, 4);
        d.vx *= damp;
        d.vy *= damp;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
      }
      if (p >= 1) this.startReform(now);
    }

    // idle life
    if (this.phase === "rest" && this.state === "idle") {
      if (now >= this.nextPeck) {
        this.peckAt = now;
        const [a, b] = TIMING.peckEveryMs;
        this.nextPeck = now + a + Math.random() * (b - a);
      }
      if (now >= this.nextTwinkle) {
        const n = 1 + (Math.random() < 0.4 ? 1 : 0);
        for (let k = 0; k < n; k++) this.twinkle.push({ i: Math.floor(Math.random() * this.dots.length), at: now });
        this.nextTwinkle = now + TIMING.twinkleEveryMs * (0.6 + Math.random() * 0.8);
      }
    }
    this.twinkle = this.twinkle.filter((t) => now - t.at < TIMING.twinkleMs);

    // glow easing
    const g = GLOW[this.glowState];
    const target = P[g.color];
    const k = 1 - Math.exp(-dt / 0.22);
    for (let c = 0; c < 3; c++) this.glow.color[c] = this.glow.color[c]! + (target[c]! - this.glow.color[c]!) * k;
    this.glow.strength += (g.strength - this.glow.strength) * k;
    this.glow.flash *= Math.exp(-dt / 0.35);
  }

  // ---------- painting ----------

  /** Where a dot is drawn right now, with breathing / peck / swirl / wobble applied (figure space). */
  private displayPos(d: Dot, i: number, now: number): [number, number] {
    let { x, y } = d;
    if (this.phase !== "rest") return [x, y];
    const t = now / 1000;
    if (this.shape === "chicken") {
      const s = 1 + TIMING.breatheAmp * Math.sin((2 * Math.PI * now) / TIMING.breathePeriodMs);
      const [cx, cy] = CHICKEN.center;
      x = cx + (x - cx) * s;
      y = cy + (y - cy) * s;
      const pk = (now - this.peckAt) / TIMING.peckMs;
      if (d.head && pk >= 0 && pk <= 1) {
        const bump = Math.sin(pk * Math.PI);
        x += 0.07 * bump;
        y += 0.13 * bump;
      }
    } else {
      const [cx, cy] = EGG.center;
      if (this.state === "thinking" && !d.outline) {
        // swirl inside the egg: rotate in ellipse-normalized space so dots stay inside
        const rx = 0.62, ry = 0.86;
        const u = (x - cx) / rx, v = (y - cy) / ry;
        const a = TIMING.swirlSpeed * t * (0.6 + 0.8 * d.seed);
        x = cx + (u * Math.cos(a) - v * Math.sin(a)) * rx;
        y = cy + (u * Math.sin(a) + v * Math.cos(a)) * ry;
      }
      if (this.state === "noticed") {
        const w = (now - this.stateSince) / TIMING.noticedWobbleMs;
        if (w < 1) {
          const ang = 0.16 * Math.sin(w * Math.PI * 5) * (1 - w);
          const dx = x - cx, dy = y - 0.9; // pivot near the base
          x = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
          y = 0.9 + dx * Math.sin(ang) + dy * Math.cos(ang);
        }
      }
      if (this.state === "ready") {
        const s = 1 + 0.02 * Math.sin((2 * Math.PI * now) / TIMING.readyPulseMs);
        x = cx + (x - cx) * s;
        y = cy + (y - cy) * s;
      }
    }
    void i;
    return [x, y];
  }

  private paintStill() {
    // Reduced motion: target figure, no motion, glow per state.
    const fig = this.state === "idle" ? CHICKEN : EGG;
    this.dots.forEach((d, i) => {
      const t = fig.dots[i]!;
      d.x = d.tx = t.x;
      d.y = d.ty = t.y;
      d.accent = t.accent;
      d.trail = [];
    });
    this.shape = this.state === "idle" ? "chicken" : "egg";
    this.phase = "rest";
    const g = GLOW[this.glowState];
    this.glow.color = [...P[g.color]] as Rgb;
    this.glow.strength = g.strength;
    this.enginePrev = null;
    this.paint(600, true);
  }

  private paint(ms: number, still = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const scale = this.canvas.width / L;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, L, L);
    const now = ms;
    const g = GLOW[this.glowState];
    const pulse = still ? 0 : g.pulse * (0.5 + 0.5 * Math.sin((2 * Math.PI * now) / TIMING.readyPulseMs));
    const glowA = Math.min(1, this.glow.strength + pulse + this.glow.flash * 0.6);
    const glowColor: Rgb = this.glow.flash > 0.05 ? mix(this.glow.color, P.ember, Math.min(1, this.glow.flash)) : this.glow.color;

    // 1. outer glow
    const og = ctx.createRadialGradient(C, C, R * 0.8, C, C, L / 2);
    og.addColorStop(0, rgba(glowColor, glowA * 0.55));
    og.addColorStop(0.45, rgba(glowColor, glowA * 0.18));
    og.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, L, L);

    // 2. glassy Night body
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(C - R * 0.3, C - R * 0.38, R * 0.1, C, C, R);
    body.addColorStop(0, "#2B2119");
    body.addColorStop(0.62, PALETTE.night);
    body.addColorStop(1, "#080605");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();

    // 3. inner state tint (depth from below)
    const it = ctx.createRadialGradient(C, C + R * 0.9, 0, C, C + R * 0.9, R * 1.3);
    it.addColorStop(0, rgba(glowColor, glowA * 0.32));
    it.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = it;
    ctx.fillRect(C - R, C - R, R * 2, R * 2);

    // 4. thinking-orbs engine layer (recoloured), crossfaded like GLANCE's orb
    const tSec = still ? 0.6 : now / 1000;
    const prev = this.enginePrev;
    const mix01 = prev ? clamp01(1 - (prev.until - tSec) / CROSSFADE_S) : 1;
    if (prev && mix01 < 1) this.engineLayer(ctx, prev.preset, tSec, prev.alpha * (1 - mix01));
    else this.enginePrev = null;
    this.engineLayer(ctx, this.engine.preset, tSec, this.engine.alpha * mix01);

    // 5. figure dots (inside the glass; during the burst they fly out past the rim, see below)
    const bursting = this.phase === "burst";
    if (!bursting) this.paintFigure(ctx, now);

    // 6. specular highlight + rim
    const hl = ctx.createRadialGradient(C - R * 0.38, C - R * 0.5, 0, C - R * 0.38, C - R * 0.5, R * 0.55);
    hl.addColorStop(0, rgba(P.shell, 0.13));
    hl.addColorStop(1, rgba(P.shell, 0));
    ctx.fillStyle = hl;
    ctx.fillRect(C - R, C - R, R * 2, R * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(C, C, R - 0.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(P.ash, 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(C, C, R - 1.6, 0, Math.PI * 2);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rgba(glowColor, glowA * 0.45);
    ctx.stroke();
    if (bursting) this.paintFigure(ctx, now);
  }

  private engineLayer(ctx: CanvasRenderingContext2D, p: Resolved, tSec: number, alpha: number) {
    if (alpha <= 0.002) return;
    const frame = MODE_FRAMES[p.mode](ENGINE_PRESET, tSec * p.speed, p.opts);
    const off = C - ENGINE_PRESET / 2;
    for (const l of frame.lines) {
      ctx.strokeStyle = rgba(mix(P.ash, P.shell, 1 - l.white), (l.a ?? 1) * alpha);
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(off + l.x1, off + l.y1);
      ctx.lineTo(off + l.x2, off + l.y2);
      ctx.stroke();
    }
    for (const d of frame.dots) {
      // engine ink: white 0 = darkest; mirrored for the dark body (near dots read bright)
      ctx.fillStyle = rgba(mix(P.ash, P.shell, 1 - d.white), (d.a ?? 1) * alpha);
      ctx.beginPath();
      ctx.arc(off + d.x, off + d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintFigure(ctx: CanvasRenderingContext2D, now: number) {
    const fade = this.phase === "burst" ? 1 - 0.35 * clamp01((now - this.phaseStart) / this.phaseMs) : 1;
    const twinkling = new Map(this.twinkle.map((t) => [t.i, Math.sin(clamp01((now - t.at) / TIMING.twinkleMs) * Math.PI)]));

    // meteor trails / burst streaks
    ctx.lineCap = "round";
    for (const d of this.dots) {
      if (d.trail.length < 2) continue;
      const color = d.crack || this.phase === "burst" ? (d.accent ? P.yolk : P.shell) : P.shell;
      for (let k = 0; k < d.trail.length - 1; k++) {
        const [x1, y1] = d.trail[k]!;
        const [x2, y2] = d.trail[k + 1]!;
        ctx.strokeStyle = rgba(color, 0.38 * (1 - k / d.trail.length) * fade);
        ctx.lineWidth = DOTS.radius * 1.3 * (1 - k / d.trail.length);
        ctx.beginPath();
        ctx.moveTo(C + x1 * F, C + y1 * F);
        ctx.lineTo(C + x2 * F, C + y2 * F);
        ctx.stroke();
      }
    }

    // dots, batched by colour
    const batches: { color: Rgb; alpha: number; r: number; pts: [number, number][] }[] = [
      { color: P.shell, alpha: 0.95 * fade, r: DOTS.radius, pts: [] },
      { color: P.yolk, alpha: 1 * fade, r: DOTS.accentRadius, pts: [] },
      { color: P.ember, alpha: 1, r: DOTS.accentRadius, pts: [] },
    ];
    const sparkles: [number, number, number][] = [];
    this.dots.forEach((d, i) => {
      const [x, y] = this.displayPos(d, i, now);
      const px = C + x * F;
      const py = C + y * F;
      const tw = twinkling.get(i);
      if (tw !== undefined) sparkles.push([px, py, tw]);
      if (d.crack && (this.phase === "crack" || this.phase === "burst")) batches[2]!.pts.push([px, py]);
      else (d.accent ? batches[1]! : batches[0]!).pts.push([px, py]);
    });
    for (const b of batches) {
      if (!b.pts.length) continue;
      ctx.fillStyle = rgba(b.color, b.alpha);
      ctx.beginPath();
      for (const [x, y] of b.pts) {
        ctx.moveTo(x + b.r, y);
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    for (const [x, y, s] of sparkles) {
      const sg = ctx.createRadialGradient(x, y, 0, x, y, DOTS.radius * 4);
      sg.addColorStop(0, rgba(P.shell, 0.9 * s));
      sg.addColorStop(1, rgba(P.shell, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(x - 5, y - 5, 10, 10);
    }
  }
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
