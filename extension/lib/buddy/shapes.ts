/**
 * Dot figures for the orb buddy, in normalized figure space ([-1, 1], y down, facing right).
 * Pure and deterministic (unit-tested). Every shape returns exactly DOTS.count points:
 * the first DOTS.outline trace the silhouette (sorted by angle), the rest fill it (sorted by
 * angle), so index i in the chicken and index i in the egg are near each other and morph cleanly.
 */
import { DOTS } from "./config";

export type Part = "body" | "head" | "beak" | "comb" | "tail" | "leg" | "shell";
export type FigureDot = { x: number; y: number; accent: boolean; part: Part; outline: boolean };
export type Figure = { dots: FigureDot[]; center: [number, number] };

type Classifier = (x: number, y: number) => Part | null;

const ACCENT_PARTS = new Set<Part>(["beak", "comb", "leg"]);

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function inTriangle(px: number, py: number, a: [number, number], b: [number, number], c: [number, number]) {
  const s = (p1: [number, number], p2: [number, number]) => (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function nearSegment(px: number, py: number, a: [number, number], b: [number, number], w: number) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy)) <= w;
}

/** A plump chick in side view: round body, clear head, beak, comb, tail, two legs, an eye hole. */
export const chickenClassifier: Classifier = (x, y) => {
  if (inEllipse(x, y, 0.5, -0.42, 0.07, 0.07)) return null; // eye (a gap reads as an eye)
  if (inTriangle(x, y, [0.66, -0.47], [0.98, -0.36], [0.66, -0.25])) return "beak";
  if (inEllipse(x, y, 0.36, -0.7, 0.09, 0.08) || inEllipse(x, y, 0.5, -0.74, 0.09, 0.09)) return "comb";
  if (inEllipse(x, y, 0.42, -0.4, 0.27, 0.27)) return "head";
  if (inTriangle(x, y, [0.22, -0.38], [0.5, -0.2], [0.18, 0.06])) return "head"; // neck
  if (inTriangle(x, y, [-0.5, -0.12], [-0.96, -0.5], [-0.62, 0.3]) || inEllipse(x, y, -0.78, -0.32, 0.16, 0.2)) return "tail";
  if (inEllipse(x, y, -0.08, 0.2, 0.64, 0.48)) return "body";
  if (nearSegment(x, y, [-0.18, 0.62], [-0.24, 0.94], 0.045) || nearSegment(x, y, [0.1, 0.62], [0.14, 0.94], 0.045)) return "leg";
  return null;
};

/** A classic egg, slightly narrower at the top. */
export const eggClassifier: Classifier = (x, y) => {
  const ry = 0.9;
  const rx = 0.66 * (1 + 0.16 * (y / ry)); // wider at the bottom (y down)
  return inEllipse(x, y, 0, 0.04, rx, ry) ? "shell" : null;
};

/** Deterministic hash in [0, 1). */
export function hash01(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Farthest-point sampling: `n` items spread evenly over the set (deterministic, starts at index 0). */
function spread<T extends { x: number; y: number }>(items: T[], n: number): T[] {
  if (items.length <= n) return pickRepeat(items, n);
  const chosen: T[] = [items[0]!];
  const dist = items.map((p) => Math.hypot(p.x - items[0]!.x, p.y - items[0]!.y));
  while (chosen.length < n) {
    let best = 0;
    for (let i = 1; i < items.length; i++) if (dist[i]! > dist[best]!) best = i;
    const p = items[best]!;
    chosen.push(p);
    for (let i = 0; i < items.length; i++) dist[i] = Math.min(dist[i]!, Math.hypot(items[i]!.x - p.x, items[i]!.y - p.y));
  }
  return chosen;
}

function pickRepeat<T>(items: T[], n: number): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(items[Math.floor((k * items.length) / n) % items.length]!);
  return out;
}

export function figureFromClassifier(classify: Classifier, opts: { accent?: (d: FigureDot, i: number) => boolean } = {}): Figure {
  const step = 0.03;
  const cells: { x: number; y: number; part: Part; edge: boolean }[] = [];
  for (let y = -1; y <= 1; y += step) {
    for (let x = -1; x <= 1; x += step) {
      const part = classify(x, y);
      if (!part) continue;
      const edge = [[step, 0], [-step, 0], [0, step], [0, -step]].some(([dx, dy]) => !classify(x + dx!, y + dy!));
      cells.push({ x, y, part, edge });
    }
  }
  const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.y, 0) / cells.length;
  const byAngle = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);

  // Spread evenly first, then order by angle so the same index in two figures sits close by.
  const outline = spread(cells.filter((c) => c.edge), DOTS.outline).sort(byAngle);
  const interiorCells = cells.filter((c) => !c.edge);
  const fill = spread(interiorCells.length ? interiorCells : cells, DOTS.count - DOTS.outline).sort(byAngle);

  const dots: FigureDot[] = [
    ...outline.map((c) => ({ x: c.x, y: c.y, part: c.part, outline: true, accent: ACCENT_PARTS.has(c.part) })),
    ...fill.map((c) => ({ x: c.x, y: c.y, part: c.part, outline: false, accent: ACCENT_PARTS.has(c.part) })),
  ];
  if (opts.accent) dots.forEach((d, i) => (d.accent = d.accent || opts.accent!(d, i)));
  return { dots, center: [cx, cy] };
}

export const CHICKEN: Figure = figureFromClassifier(chickenClassifier);
/** A few Yolk speckles on the shell. */
export const EGG: Figure = figureFromClassifier(eggClassifier, { accent: (d, i) => !d.outline && hash01(i, 3) < 0.07 });

/** Zigzag crack across the egg (normalized): a polyline through `teeth` alternating peaks, sampled as `n` points left to right. */
export function crackPoints(n: number, y = -0.02, width = 0.62, amp = 0.11, teeth = 7): [number, number][] {
  const vx = (k: number) => -width + (2 * width * k) / teeth;
  const vy = (k: number) => y + (k % 2 === 0 ? -amp : amp);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const seg = Math.min(teeth - 1, Math.floor(t * teeth));
    const local = t * teeth - seg;
    pts.push([vx(seg) + (vx(seg + 1) - vx(seg)) * local, vy(seg) + (vy(seg + 1) - vy(seg)) * local]);
  }
  return pts;
}
