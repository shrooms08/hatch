/**
 * The floating buddy's view: the orb (lib/buddy/orb.ts), dragging, badge, bubble and menu.
 * No storage, network or page logic here (see index.ts); everything comes in through methods
 * and goes out through callbacks.
 */
import { OrbBuddy } from "../../lib/buddy/orb";
import geist500 from "@fontsource/geist/files/geist-latin-500-normal.woff2?inline";
import geist600 from "@fontsource/geist/files/geist-latin-600-normal.woff2?inline";
import { SIZE } from "../../lib/buddy/config";
import type { EggPos } from "../../lib/storage";
import type { EggState } from "../../lib/types";

const MARGIN = 8;

/**
 * Geist for the bubble, registered as page fonts from inlined bytes under a private family name.
 * Nothing is fetched and no extension URL is exposed to the page.
 */
let fontsLoaded = false;
function loadBubbleFonts() {
  if (fontsLoaded || typeof FontFace === "undefined") return;
  fontsLoaded = true;
  for (const [src, weight] of [[geist500, "500"], [geist600, "600"]] as const) {
    const face = new FontFace("Hatch Geist", `url(${src})`, { weight, style: "normal", display: "swap" });
    void face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
  }
}
const DRAG_THRESHOLD = 4;

export type BuddyCallbacks = {
  onOpen: () => void;
  onMove: (pos: EggPos) => void;
  onHide: (scope: "site" | "everywhere") => void;
};

export class BuddyView {
  private root: HTMLDivElement;
  private button: HTMLButtonElement;
  private badge: HTMLSpanElement;
  private bubble: HTMLDivElement;
  private bubbleText: HTMLSpanElement;
  private bubbleActions: HTMLDivElement;
  private menu: HTMLDivElement;
  private orb: OrbBuddy;
  private bubbleTimer: number | undefined;
  private pos: EggPos;
  private onResize = () => this.applyPos();

  constructor(container: HTMLElement, pos: EggPos, private cb: BuddyCallbacks) {
    this.pos = pos;
    this.root = document.createElement("div");
    this.root.className = "hatch-egg";
    this.root.dataset.state = "idle";
    this.root.innerHTML = `
      <div class="hatch-egg__bubble" role="status" aria-live="polite">
        <div class="hatch-egg__bubble-row"><span class="hatch-egg__bubble-text"></span><button type="button" class="hatch-egg__bubble-close" aria-label="Dismiss">×</button></div>
        <div class="hatch-egg__bubble-actions"></div>
      </div>
      <div class="hatch-egg__menu" role="menu">
        <button type="button" role="menuitem" data-hide="site">Hide on this site</button>
        <button type="button" role="menuitem" data-hide="everywhere">Hide everywhere</button>
      </div>
      <button type="button" class="hatch-egg__button" aria-label="Open Hatch"><span class="hatch-egg__badge"></span></button>
      <button type="button" class="hatch-egg__more" aria-label="Hatch options" title="Options">⋯</button>`;
    this.button = this.root.querySelector(".hatch-egg__button")!;
    this.badge = this.root.querySelector(".hatch-egg__badge")!;
    this.bubble = this.root.querySelector(".hatch-egg__bubble")!;
    this.bubbleText = this.root.querySelector(".hatch-egg__bubble-text")!;
    this.bubbleActions = this.root.querySelector(".hatch-egg__bubble-actions")!;
    this.root.querySelector<HTMLButtonElement>(".hatch-egg__bubble-close")!.addEventListener("click", () => this.hideBubble());
    loadBubbleFonts();
    this.menu = this.root.querySelector(".hatch-egg__menu")!;
    this.orb = new OrbBuddy();
    this.button.prepend(this.orb.canvas);
    container.append(this.root);

    this.applyPos();
    this.bindDrag();
    this.root.querySelector<HTMLButtonElement>(".hatch-egg__more")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menu.dataset.open = this.menu.dataset.open === "true" ? "false" : "true";
    });
    this.root.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.menu.dataset.open = "true";
    });
    this.menu.addEventListener("click", (e) => {
      const scope = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.hide;
      if (scope === "site" || scope === "everywhere") this.cb.onHide(scope);
      this.menu.dataset.open = "false";
    });
    window.addEventListener("resize", this.onResize);
  }

  setState(state: EggState) {
    this.root.dataset.state = state;
    this.orb.setState(state);
  }

  /** launched / hatched: crack-and-burst, then back to the chicken. */
  hatch(): Promise<void> {
    this.root.dataset.state = "idle";
    return this.orb.hatch();
  }

  setTrackingCount(count: number) {
    this.root.dataset.tracking = count > 0 ? "true" : "false";
    this.badge.textContent = count > 99 ? "99+" : String(count);
    this.button.setAttribute("aria-label", count > 0 ? `Open Hatch (${count} incubating)` : "Open Hatch");
  }

  /**
   * A hint ("This is about NVIDIA…"): Show me opens the side panel, Not now dismisses.
   * A milestone with a link: the link is the primary action.
   */
  showBubble(text: string, opts: { url?: string; linkText?: string; timeoutMs?: number } = {}) {
    this.bubbleText.textContent = text;
    this.bubbleActions.replaceChildren();
    let primary: HTMLElement;
    if (opts.url) {
      const a = document.createElement("a");
      a.href = opts.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = opts.linkText ?? "Open";
      a.addEventListener("click", () => this.hideBubble());
      primary = a;
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Show me";
      b.addEventListener("click", () => {
        this.hideBubble();
        this.cb.onOpen();
      });
      primary = b;
    }
    primary.className = "hatch-egg__bubble-primary";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "hatch-egg__bubble-secondary";
    later.textContent = "Not now";
    later.addEventListener("click", () => this.hideBubble());
    this.bubbleActions.append(primary, later);
    this.bubble.dataset.open = "true";
    window.clearTimeout(this.bubbleTimer);
    this.bubbleTimer = window.setTimeout(() => this.hideBubble(), opts.timeoutMs ?? 12_000);
  }

  hideBubble() {
    this.bubble.dataset.open = "false";
  }

  setPos(pos: EggPos) {
    this.pos = pos;
    this.applyPos();
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.orb.destroy();
    this.root.remove();
  }

  private applyPos() {
    const size = SIZE.docked;
    const maxRight = Math.max(MARGIN, window.innerWidth - size - MARGIN);
    const maxBottom = Math.max(MARGIN, window.innerHeight - size - MARGIN);
    this.pos = {
      right: Math.min(Math.max(MARGIN, this.pos.right), maxRight),
      bottom: Math.min(Math.max(MARGIN, this.pos.bottom), maxBottom),
    };
    this.root.style.right = `${this.pos.right}px`;
    this.root.style.bottom = `${this.pos.bottom}px`;
  }

  private bindDrag() {
    let start: { x: number; y: number; pos: EggPos } | null = null;
    let dragged = false;
    this.button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, pos: { ...this.pos } };
      dragged = false;
      this.button.setPointerCapture(e.pointerId);
    });
    this.button.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragged = true;
      this.pos = { right: start.pos.right - dx, bottom: start.pos.bottom - dy };
      this.applyPos();
    });
    this.button.addEventListener("pointerup", (e) => {
      if (!start) return;
      this.button.releasePointerCapture(e.pointerId);
      start = null;
      if (dragged) this.cb.onMove(this.pos);
      else {
        this.menu.dataset.open = "false";
        this.cb.onOpen();
      }
    });
    this.button.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.cb.onOpen();
      }
    });
  }
}
