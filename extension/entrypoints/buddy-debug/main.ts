/**
 * Dev/debug page for the buddy (unlisted: not linked from the UI). Open it at
 * chrome-extension://<extension id>/buddy-debug.html. Every state of the grid renderer at docked 64 px and
 * hover 80 px, next to the website's static art (same formula as web ChickenOrb), plus a redraw counter.
 */
import { browser } from "wxt/browser";
import { GridBuddy, type BuddyState } from "../../lib/buddy/grid";
import { ART, CELL_COLOR, CHICKEN, EGG, GRID } from "../../lib/buddy/art";
import type { SoundName } from "../../lib/buddy/config";

const STATES: (BuddyState | "hatch")[] = ["idle", "noticed", "thinking", "ready", "hatch"];
const SIZES = [64, 80];
let reduced = false;
let badge = 0;
let buddies: { b: GridBuddy; state: BuddyState | "hatch"; badge?: HTMLElement }[] = [];
const drawsEl = document.getElementById("draws")!;

/** The website's ChickenOrb, rebuilt with the same maths (CSS grid of round dots). */
function websiteArt(size: number, mood: "chicken" | "egg") {
  const cell = (size * ART.gridRatio) / GRID;
  const s = +(cell * ART.dotRatio).toFixed(2);
  const gap = +(cell * (1 - ART.dotRatio)).toFixed(2);
  const disc = document.createElement("div");
  disc.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;border:1px solid ${ART.border};background:${ART.background};box-shadow:${ART.shadow}, 0 0 0 ${ART.ringWidth(size)}px ${ART.ring};display:flex;align-items:center;justify-content:center;box-sizing:border-box`;
  const grid = document.createElement("div");
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${GRID}, ${s}px);gap:${gap}px`;
  for (const c of (mood === "egg" ? EGG : CHICKEN).join("")) {
    const d = document.createElement("div");
    d.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;background:${CELL_COLOR[c]}`;
    grid.append(d);
  }
  disc.append(grid);
  return disc;
}

function figure(label: string, slotSize: number, content: (slot: HTMLElement) => void) {
  const fig = document.createElement("figure");
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.style.width = slot.style.height = `${slotSize}px`;
  content(slot);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  fig.append(slot, cap);
  return fig;
}

function build() {
  buddies.forEach((x) => x.b.destroy());
  buddies = [];
  for (const theme of ["dark", "light"]) {
    const stage = document.getElementById(theme)!;
    stage.innerHTML = "";
    for (const size of SIZES) {
      const row = document.createElement("div");
      row.className = "row";
      row.append(figure(`website chicken · ${size}`, size, (s) => s.append(websiteArt(size, "chicken"))));
      row.append(figure(`website egg · ${size}`, size, (s) => s.append(websiteArt(size, "egg"))));
      for (const state of STATES) {
        row.append(
          figure(`${state} · ${size}`, size, (slot) => {
            const b = new GridBuddy({ reducedMotion: reduced });
            slot.append(b.el);
            let badgeEl: HTMLElement | undefined;
            if (state === "idle") {
              badgeEl = document.createElement("span");
              badgeEl.className = "badge";
              slot.append(badgeEl);
            }
            buddies.push({ b, state, badge: badgeEl });
          })
        );
      }
      stage.append(row);
    }
  }
  // Let the ResizeObserver size each canvas, then apply the states.
  requestAnimationFrame(() => {
    for (const x of buddies) {
      if (x.state === "hatch") {
        x.b.setState("ready");
        void x.b.hatch();
      } else x.b.setState(x.state);
    }
    renderBadge();
  });
}

function renderBadge() {
  for (const x of buddies) {
    if (!x.badge) continue;
    x.badge.textContent = String(badge);
    x.badge.classList.toggle("on", badge > 0);
  }
}

// For automated checks: per-buddy redraw counts.
(window as unknown as { __buddies: () => unknown }).__buddies = () => buddies.map((x) => ({ state: x.state, draws: x.b.draws }));

setInterval(() => {
  drawsEl.textContent = `${buddies.reduce((n, x) => n + x.b.draws, 0)} redraws`;
}, 500);

document.getElementById("controls")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  switch (btn.dataset.action) {
    case "hatch":
      buddies.filter((x) => x.state === "hatch").forEach((x) => void x.b.hatch());
      break;
    case "badge-up":
      badge++;
      renderBadge();
      break;
    case "badge-down":
      badge = Math.max(0, badge - 1);
      renderBadge();
      break;
    case "reduced":
      reduced = !reduced;
      btn.setAttribute("aria-pressed", String(reduced));
      build();
      break;
  }
  const sound = btn.dataset.sound as SoundName | undefined;
  if (sound) void browser.runtime.sendMessage({ type: "play-sound", sound });
});

// Last sound the background played (name, whether audio.play() succeeded).
const soundEl = document.getElementById("sound")!;
const showSound = (v: unknown) => {
  const s = v as { name: string; at: number; played: boolean; error?: string } | undefined;
  if (s) soundEl.textContent = `last sound: ${s.name} ${s.played ? "played" : `failed (${s.error ?? "?"})`} at ${new Date(s.at).toLocaleTimeString()}`;
};
if (browser?.storage?.session) {
  void browser.storage.session.get("hatch:lastSound").then((r) => showSound(r["hatch:lastSound"]));
  browser.storage.onChanged.addListener((c, area) => {
    if (area === "session" && c["hatch:lastSound"]) showSound(c["hatch:lastSound"].newValue);
  });
}

build();
