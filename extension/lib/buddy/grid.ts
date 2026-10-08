/**
 * The in-page buddy: the website's dot-matrix disc (lib/buddy/art.ts, copied from the web app), drawn on
 * one canvas inside the disc. Cells snap to whole device pixels so the grid stays crisp at 64 and 80 px.
 *
 * Frames are drawn only when something changes: a state change, a short idle moment (blink or peck plus a
 * twinkle every 4 to 6 s), the thinking pulse, or the hatch sequence. Nothing runs while the tab or the
 * buddy is hidden. Reduced motion: still frames only, shapes swap instantly.
 */
import { ART, CELL_COLOR, CHICKEN, CHICKEN_BLINK, CHICKEN_PECK, EGG, EGG_CRACK, GRID } from "./art";
import { TIMING } from "./config";

export type BuddyState = "idle" | "noticed" | "thinking" | "ready";
type Frame = string[];
type Cell = { ch: string; a: number; glow: number; dx: number; dy: number };
type Anim =
  | { k: "moment"; frame: Frame; start: number; twinkle: number[] }
  | { k: "wave"; from: Frame; to: Frame; start: number; dur: number; then?: () => void }
  | { k: "think"; start: number }
  | { k: "hatch"; start: number };

const N = GRID * GRID;
const YOLK = "#F2A93B";
const EMBER = "#E8572A";
/** Disc ring per state (box-shadow after the drop shadow). */
const RING: Record<BuddyState | "hatching", (w: number) => string> = {
  idle: (w) => `0 0 0 ${w}px ${ART.ring}`,
  noticed: (w) => `0 0 0 ${w}px rgba(242,169,59,0.28), 0 0 16px rgba(242,169,59,0.30)`,
  thinking: (w) => `0 0 0 ${w}px rgba(242,169,59,0.22)`,
  ready: (w) => `0 0 0 ${w}px rgba(242,169,59,0.42), 0 0 20px rgba(242,169,59,0.38)`,
  hatching: (w) => `0 0 0 ${w}px rgba(232,87,42,0.55), 0 0 22px rgba(232,87,42,0.45)`,
};
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const flat = (f: Frame) => f.join("");
/** Yolk cells of the egg, in reading order (the thinking pulse runs through them). */
const EGG_YOLK = flat(EGG)
  .split("")
  .flatMap((c, i) => (c === "Y" ? [i] : []));

export type GridBuddyOptions = { reducedMotion?: boolean };

export class GridBuddy {
  /** The disc. Size it with CSS; the canvas follows (ResizeObserver). */
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  private size = 0;
  private state: BuddyState = "idle";
  private base: Frame = CHICKEN;
  private anim: Anim | null = null;
  private raf = 0;
  private lastDraw = 0;
  private idleTimer: number | undefined;
  private visible = true;
  private reduced: boolean;
  private hatchQueue: (() => void)[] = [];
  private pendingState: BuddyState | null = null;
  private ro: ResizeObserver;
  private mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  /** Frames drawn so far (debug page / tests). */
  draws = 0;

  constructor(private opts: GridBuddyOptions = {}) {
    this.el = document.createElement("div");
    this.el.className = "hatch-disc";
    this.el.setAttribute("aria-hidden", "true");
    Object.assign(this.el.style, {
      position: "absolute",
      inset: "0",
      borderRadius: "50%",
      background: ART.background,
      transition: "box-shadow 260ms ease-out",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", borderRadius: "50%", display: "block" });
    this.el.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.reduced = opts.reducedMotion ?? this.mq.matches;
    if (opts.reducedMotion === undefined) this.mq.addEventListener("change", this.onMotion);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  // ---------- public API ----------

  get currentState(): BuddyState {
    return this.state;
  }

  setState(next: BuddyState) {
    if (this.hatchQueue.length) {
      this.pendingState = next; // after the hatch sequence
      return;
    }
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.paintRing();
    const want = next === "idle" ? CHICKEN : EGG;
    const now = performance.now();
    this.clearIdle();
    if (this.reduced || !this.live) {
      this.base = want;
      this.anim = null;
      this.drawStill();
    } else if (want !== this.base) {
      const from = this.base;
      this.base = want;
      this.anim = { k: "wave", from, to: want, start: now, dur: TIMING.waveMs, then: () => this.afterSettle() };
      if (next === "noticed") this.wobble();
      this.kick();
    } else {
      if (next === "noticed" && prev !== "noticed") this.wobble();
      this.anim = null;
      this.afterSettle();
    }
  }

  /** launched / hatched: crack the egg, burst, reform the chicken. Resolves when done. */
  hatch(): Promise<void> {
    return new Promise((resolve) => {
      this.hatchQueue.push(resolve);
      if (this.hatchQueue.length > 1) return; // already running
      this.clearIdle();
      this.paintRing("hatching");
      if (this.reduced || !this.live) {
        // Still frames: the cracked egg, then the chicken.
        this.anim = null;
        this.base = EGG_CRACK;
        this.drawStill();
        window.setTimeout(() => this.finishHatch(), TIMING.reducedHatchMs);
        return;
      }
      const start = () => {
        this.anim = { k: "hatch", start: performance.now() };
        this.kick();
      };
      if (this.base !== EGG) {
        const from = this.base;
        this.base = EGG;
        this.anim = { k: "wave", from, to: EGG, start: performance.now(), dur: TIMING.waveMs / 2, then: start };
        this.kick();
      } else start();
    });
  }

  /** The host hides/shows the buddy: no frames or timers while hidden. */
  setVisible(v: boolean) {
    this.visible = v;
    this.onVisibility();
  }

  destroy() {
    this.stop();
    this.clearIdle();
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.mq.removeEventListener("change", this.onMotion);
    this.el.remove();
  }

  // ---------- lifecycle ----------

  private get live() {
    return this.visible && !document.hidden;
  }

  private onVisibility = () => {
    if (this.live) {
      this.drawStill();
      if (this.anim) this.kick();
      else this.afterSettle();
    } else {
      this.stop();
      this.clearIdle();
    }
  };

  private onMotion = () => {
    this.reduced = this.mq.matches;
    if (this.reduced) {
      this.anim = null;
      this.stop();
      this.clearIdle();
      this.drawStill();
    } else this.afterSettle();
  };

  private resize() {
    const s = Math.round(this.el.getBoundingClientRect().width);
    if (!s || s === this.size) return;
    this.size = s;
    this.canvas.width = this.canvas.height = s * this.dpr;
    this.paintRing();
    if (!this.anim) this.drawStill();
    if (this.state === "idle" && !this.idleTimer) this.afterSettle();
  }

  /** Back to rest: a still frame, then whatever the state animates on its own. */
  private afterSettle() {
    this.anim = null;
    this.drawStill();
    if (!this.live || this.reduced) return;
    if (this.state === "thinking") {
      this.anim = { k: "think", start: performance.now() };
      this.kick();
    } else if (this.state === "idle") this.scheduleIdle();
  }

  private scheduleIdle() {
    this.clearIdle();
    const [lo, hi] = TIMING.idleMomentEveryMs;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = undefined;
      if (this.state !== "idle" || this.anim || !this.live || this.reduced) return;
      const empties = flat(this.base)
        .split("")
        .flatMap((c, i) => (c === "." ? [i] : []));
      const pick = () => empties[Math.floor(Math.random() * empties.length)]!;
      const twinkle = Math.random() < 0.5 ? [pick()] : [pick(), pick()];
      this.anim = { k: "moment", frame: Math.random() < 0.5 ? CHICKEN_BLINK : CHICKEN_PECK, start: performance.now(), twinkle };
      this.kick();
    }, lo + Math.random() * (hi - lo));
  }

  private clearIdle() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private finishHatch() {
    this.base = CHICKEN;
    this.state = "idle";
    this.paintRing();
    const done = this.hatchQueue.splice(0);
    const next = this.pendingState;
    this.pendingState = null;
    this.afterSettle();
    done.forEach((r) => r());
    if (next && next !== "idle") this.setState(next);
  }

  private kick() {
    if (this.raf || !this.live) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    this.raf = 0;
    const a = this.anim;
    if (!a || !this.live) return;
    // The thinking pulse is the only open-ended animation: capped at ~20 fps.
    if (a.k === "think" && now - this.lastDraw < 50) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const done = this.drawAnim(a, now);
    if (done) {
      if (a.k === "wave") {
        this.anim = null;
        (a.then ?? (() => this.afterSettle()))();
      } else if (a.k === "hatch") {
        this.anim = null;
        this.finishHatch();
      } else {
        this.afterSettle();
      }
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  // ---------- drawing ----------

  private wobble() {
    if (this.reduced) return;
    this.el.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(-9deg)" }, { transform: "rotate(7deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(0deg)" }],
      { duration: TIMING.waveMs, easing: "ease-out" }
    );
  }

  private paintRing(which: BuddyState | "hatching" = this.state) {
    const w = ART.ringWidth(this.size || 64);
    this.el.style.boxShadow = `${ART.shadow}, inset 0 0 0 1px ${ART.border}, ${RING[which](w)}`;
  }

  private cells(frame: Frame, glowYolk: boolean): Cell[] {
    return flat(frame)
      .split("")
      .map((ch) => ({ ch, a: 1, glow: glowYolk && ch === "Y" ? 0.85 : 0, dx: 0, dy: 0 }));
  }

  private drawStill() {
    if (!this.live && this.draws > 0) return;
    this.paint(this.cells(this.base, this.state === "noticed"));
  }

  /** Draws one frame of `a`; returns true when the animation is over. */
  private drawAnim(a: Anim, now: number): boolean {
    const t = now - a.start;
    switch (a.k) {
      case "moment": {
        const c = this.cells(t < TIMING.idleMomentMs ? a.frame : this.base, false);
        const tw = Math.sin(Math.PI * clamp01(t / TIMING.twinkleMs));
        for (const i of a.twinkle) c[i]!.a = 1 + tw * 4; // '.' alpha 0.07 -> ~0.35
        this.paint(c);
        return t >= TIMING.twinkleMs;
      }
      case "wave": {
        const p = clamp01(t / a.dur);
        const from = flat(a.from);
        const to = flat(a.to);
        const c: Cell[] = [];
        for (let i = 0; i < N; i++) {
          const r = Math.floor(i / GRID);
          const col = i % GRID;
          const at = ((r + col) / (2 * (GRID - 1))) * 0.8; // diagonal sweep, cell by cell
          const ch = p >= at ? to[i]! : from[i]!;
          c.push({ ch, a: 1, glow: ch === "Y" && p >= at ? 0.85 : 0, dx: 0, dy: 0 });
        }
        this.paint(c);
        return p >= 1;
      }
      case "think": {
        const c = this.cells(EGG, false);
        const phase = (t / TIMING.thinkPeriodMs) * Math.PI * 2;
        EGG_YOLK.forEach((idx, k) => {
          const v = Math.pow(Math.max(0, Math.sin(phase - k * 0.55)), 2);
          c[idx]!.a = 0.5 + 0.5 * v;
          c[idx]!.glow = v;
        });
        this.paint(c);
        return false;
      }
      case "hatch": {
        const { crackMs, burstMs, reformMs } = TIMING;
        if (t < crackMs) {
          // The zigzag reads as dark gaps rimmed with ember light.
          this.paint(this.cells(EGG_CRACK, false).map((x) => (x.ch === "N" ? { ...x, glow: 1.2 } : x.ch === "Y" ? { ...x, glow: 0.5 } : x)), EMBER);
          return false;
        }
        const pitch = this.pitch();
        if (t < crackMs + burstMs) {
          const p = easeOut((t - crackMs) / burstMs);
          const c = this.cells(EGG_CRACK, false).map((x, i) => {
            if (x.ch === "." || x.ch === "N") return x;
            const r = Math.floor(i / GRID) - (GRID - 1) / 2;
            const col = (i % GRID) - (GRID - 1) / 2;
            const len = Math.hypot(r, col) || 1;
            const reach = 2 + ((i * 7) % 3); // 2-4 cells out
            return { ...x, a: 1 - p, dx: (col / len) * reach * pitch * p, dy: (r / len) * reach * pitch * p, glow: x.ch === "Y" ? 1 - p : 0 };
          });
          this.paint(c);
          return false;
        }
        const p = clamp01((t - crackMs - burstMs) / reformMs);
        this.paint(this.cells(CHICKEN, false).map((x) => (x.ch === "." ? x : { ...x, a: p })));
        return p >= 1;
      }
    }
  }

  private pitch() {
    return Math.max(2, Math.round(((this.size || 64) * ART.gridRatio * this.dpr) / GRID));
  }

  private paint(cells: Cell[], glowColor = YOLK) {
    const ctx = this.ctx;
    if (!ctx || !this.size) return;
    this.draws++;
    this.lastDraw = performance.now();
    const W = this.canvas.width;
    const pitch = this.pitch();
    const dot = Math.max(1, Math.round(pitch * ART.dotRatio));
    const span = GRID * pitch - (pitch - dot);
    const o = Math.round((W - span) / 2); // whole-pixel origin: crisp grid
    const round = dot >= 4;
    ctx.clearRect(0, 0, W, W);
    for (let i = 0; i < N; i++) {
      const cell = cells[i]!;
      const x = o + (i % GRID) * pitch + Math.round(cell.dx);
      const y = o + Math.floor(i / GRID) * pitch + Math.round(cell.dy);
      // Empty dots twinkle by brightening their own (very faint) colour.
      const base = cell.ch === "." && cell.a > 1 ? `rgba(246,238,220,${Math.min(0.5, 0.07 * cell.a).toFixed(3)})` : (CELL_COLOR[cell.ch] ?? CELL_COLOR["."]!);
      ctx.globalAlpha = cell.ch === "." ? 1 : clamp01(cell.a);
      if (ctx.globalAlpha <= 0.01) continue;
      ctx.fillStyle = base;
      if (cell.glow > 0) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = pitch * 1.6 * cell.glow;
      }
      if (round) {
        ctx.beginPath();
        ctx.arc(x + dot / 2, y + dot / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(x, y, dot, dot);
      if (cell.glow > 0) ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}
