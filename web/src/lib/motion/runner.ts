// Runs one animation (a "spec", same shape as the lab's specimens) on a canvas: fixed 1/120 s physics
// substeps, devicePixelRatio capped at 2, paused while off screen (IntersectionObserver) or while the tab is
// hidden, and with prefers-reduced-motion the settled final frame is drawn with no motion.
import { stepDots, stepParts, shake, geom, type Dot, type Geom, type Scene } from './engine';
import { silently } from './sound';

export type Spec<S extends Scene> = {
  /** Seconds until the scene has settled (Infinity for ambient scenes). */
  dur: number;
  setup(S: S): void;
  events?: [number, (S: S) => void][];
  update?(S: S, dt: number): void;
  draw(ctx: CanvasRenderingContext2D, G: Geom, S: S): void;
  /** Dot arrays to step each frame (default: the lab's egg, chick, dots, ring). */
  dotSets?(S: S): Dot[][];
  geom?(w: number, h: number): Geom;
  /** Reduced motion / ambient scenes: put S in its final, still state (default: fast-forward to dur). */
  settle?(S: S): void;
};

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Options = {
  /** Replay after this many seconds past dur (loop), or play once. */
  loopHold?: number | null;
  onEnd?: () => void;
  reduced?: boolean;
};

const SUBSTEP = 1 / 120;

export class MotionRunner<S extends Scene> {
  S!: S;
  readonly reduced: boolean;
  private events: [number, (S: S) => void][] = [];
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private raf = 0;
  private last = 0;
  private visible = true;
  private running = false;
  private ended = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private spec: Spec<S>,
    private opts: Options = {}
  ) {
    this.reduced = opts.reduced ?? prefersReducedMotion();
    this.reset();
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(
        (es) => {
          this.visible = es.some((e) => e.isIntersecting);
          if (this.visible) this.kick();
        },
        { rootMargin: '60px' }
      );
      this.io.observe(canvas);
    }
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(canvas);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Start (or restart) the scene. Reduced motion: draw the settled frame and finish at once. */
  play() {
    this.reset();
    this.ended = false;
    if (this.reduced) {
      this.settleNow();
      this.render();
      this.finish();
      return;
    }
    this.running = true;
    this.kick();
  }

  /** Keep an ambient scene running (no end), e.g. the egg's bubbles. */
  run() {
    if (this.reduced) {
      this.settleNow();
      this.render();
      return;
    }
    this.running = true;
    this.kick();
  }

  /** Redraw now (after the owner changed S, or for reduced motion). */
  refresh() {
    if (this.reduced) this.settleNow();
    this.render();
    this.kick();
  }

  get isRunning() {
    return this.running;
  }

  destroy() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io?.disconnect();
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (!document.hidden) this.kick();
  };

  private reset() {
    const S = { t: 0, parts: [], shake: 0, fired: 0 } as unknown as S;
    this.S = S;
    this.spec.setup.call(this.spec, S);
    this.events = (this.spec.events ?? []).slice().sort((a, b) => a[0] - b[0]);
  }

  private settleNow() {
    silently(() => {
      if (this.spec.settle) this.spec.settle.call(this.spec, this.S);
      else if (Number.isFinite(this.spec.dur)) while (this.S.t < this.spec.dur) this.step(1 / 60);
    });
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.opts.onEnd?.();
  }

  private step(dt: number) {
    const S = this.S;
    const sp = this.spec;
    S.t += dt;
    while (S.fired < this.events.length && S.t >= this.events[S.fired][0]) {
      this.events[S.fired][1].call(sp, S);
      S.fired++;
    }
    sp.update?.call(sp, S, dt);
    const sets = sp.dotSets ? sp.dotSets.call(sp, S) : (['egg', 'chick', 'dots', 'ring'] as const).map((k) => (S as unknown as Record<string, Dot[] | undefined>)[k]).filter((x): x is Dot[] => !!x);
    for (const set of sets) stepDots(S, set, dt);
    stepParts(S, dt);
    S.shake *= Math.pow(0.02, dt);
  }

  private size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== this.w || h !== this.h || !this.ctx) {
      this.w = w;
      this.h = h;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx = this.canvas.getContext('2d');
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  private render() {
    // Hidden (display:none, e.g. the mobile copy on desktop) or not laid out yet: nothing to draw.
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return;
    this.size();
    const ctx = this.ctx;
    if (!ctx) return;
    const G = (this.spec.geom ?? geom)(this.w, this.h);
    this.S.G = G;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    try {
      if (!this.reduced) shake(ctx, this.S);
      this.spec.draw.call(this.spec, ctx, G, this.S);
    } catch (e) {
      // Decoration must never take a page down: stop this animation and keep the page working.
      console.error('[hatch] animation stopped:', e);
      this.running = false;
    } finally {
      ctx.restore();
    }
  }

  private kick() {
    if (this.raf || !this.running || !this.visible || document.hidden || this.reduced) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.running) return;
    if (!this.visible || document.hidden) return; // resumes from kick() when visible again
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const n = Math.max(1, Math.ceil(raw / SUBSTEP));
    for (let i = 0; i < n; i++) this.step(raw / n);
    const { loopHold } = this.opts;
    if (Number.isFinite(this.spec.dur) && this.S.t > this.spec.dur + (loopHold ?? 0)) {
      if (loopHold != null) this.reset();
      else {
        this.running = false;
        this.render();
        this.finish();
        return;
      }
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };
}
