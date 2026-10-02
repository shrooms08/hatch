/**
 * Dev/debug page for the orb buddy (unlisted: not linked from the UI). Open it at
 * chrome-extension://<extension id>/buddy-debug.html. Shows the orb at 200 px and docked 64 px on
 * dark and light backgrounds, every state and transition, both sounds, and an FPS readout.
 */
import { browser } from "wxt/browser";
import { OrbBuddy, type BuddyState } from "../../lib/buddy/orb";
import type { SoundName } from "../../lib/buddy/config";

const SIZES = [200, 64];
let reduced = false;
let badge = 0;
let orbs: { orb: OrbBuddy; badge?: HTMLElement }[] = [];
let current: BuddyState = "idle";
const fpsEl = document.getElementById("fps")!;

function build() {
  orbs.forEach((o) => o.orb.destroy());
  orbs = [];
  for (const id of ["dark", "light"]) {
    const stage = document.getElementById(id)!;
    stage.innerHTML = "";
    for (const size of SIZES) {
      const fig = document.createElement("figure");
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.width = slot.style.height = `${size}px`;
      const orb = new OrbBuddy({
        renderSize: size,
        reducedMotion: reduced,
        onFps: id === "dark" && size === 200 ? (f) => (fpsEl.textContent = `${f.toFixed(0)} fps`) : undefined,
      });
      slot.append(orb.canvas);
      let b: HTMLElement | undefined;
      if (size === 64) {
        b = document.createElement("span");
        b.className = "badge";
        slot.append(b);
      }
      const cap = document.createElement("figcaption");
      cap.textContent = `${size}px · ${id}`;
      fig.append(slot, cap);
      stage.append(fig);
      orb.setState(current);
      orbs.push({ orb, badge: b });
    }
  }
  renderBadge();
}

function renderBadge() {
  for (const o of orbs) {
    if (!o.badge) continue;
    o.badge.textContent = String(badge);
    o.badge.classList.toggle("on", badge > 0);
  }
}

document.getElementById("controls")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const state = btn.dataset.state as BuddyState | undefined;
  if (state) {
    current = state;
    orbs.forEach((o) => o.orb.setState(state));
  }
  switch (btn.dataset.action) {
    case "hatch":
      current = "idle";
      orbs.forEach((o) => void o.orb.hatch());
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
      fpsEl.textContent = reduced ? "still (reduced motion)" : "– fps";
      build();

// Last sound the background played (name, whether audio.play() succeeded).
const soundEl = document.getElementById("sound")!;
const showSound = (v: unknown) => {
  const s = v as { name: string; at: number; played: boolean; error?: string } | undefined;
  if (s) soundEl.textContent = `last sound: ${s.name} ${s.played ? "played" : `failed (${s.error ?? "?"})`} at ${new Date(s.at).toLocaleTimeString()}`;
};
void browser.storage.session.get("hatch:lastSound").then((r) => showSound(r["hatch:lastSound"]));
browser.storage.onChanged.addListener((c, area) => {
  if (area === "session" && c["hatch:lastSound"]) showSound(c["hatch:lastSound"].newValue);
});
      break;
  }
  const sound = btn.dataset.sound as SoundName | undefined;
  if (sound) void browser.runtime.sendMessage({ type: "play-sound", sound });
});

build();
