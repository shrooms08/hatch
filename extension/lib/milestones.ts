/** Which hatch milestones to announce after a poll. Pure, so it is unit-tested. */
import type { Milestones } from "./storage";
import type { HatchSummary } from "./types";

export const ALMOST_AT = 80;

export type MilestoneEvent = {
  mint: string;
  text: string;
  /** Token page path (relative to the web app). */
  url: string;
  /** Also raise a Chrome notification (80% / hatched); fee reminders are egg bubbles only. */
  notify: boolean;
};

const label = (h: HatchSummary) => h.symbol || h.name;

export function diffMilestones(prev: Milestones, list: HatchSummary[]): { next: Milestones; events: MilestoneEvent[] } {
  const next: Milestones = {};
  const events: MilestoneEvent[] = [];
  for (const h of list) {
    const p = prev[h.mint];
    const hatched = h.status === "Hatched";
    const almost = hatched || h.progress >= ALMOST_AT;
    const fees = h.claimableCreatorFees.hasFees;

    if (!p) {
      // First sight: record silently (no "hatched!" for tokens that hatched before we tracked them),
      // except a pending fee reminder.
      next[h.mint] = { seen: true, almost, hatched, fees };
      if (fees) events.push(feeEvent(h));
      continue;
    }

    if (hatched && !p.hatched) events.push({ mint: h.mint, text: `${label(h)} hatched!`, url: h.tokenUrl, notify: true });
    else if (almost && !p.almost) events.push({ mint: h.mint, text: `${label(h)} is ${ALMOST_AT}% to hatching`, url: h.tokenUrl, notify: true });
    if (fees && !p.fees) events.push(feeEvent(h));

    next[h.mint] = { seen: true, almost: p.almost || almost, hatched: p.hatched || hatched, fees };
  }
  return { next, events };
}

function feeEvent(h: HatchSummary): MilestoneEvent {
  const f = h.claimableCreatorFees;
  return { mint: h.mint, text: `You can claim ${f.amount} ${f.symbol} in creator fees on ${label(h)}`, url: h.tokenUrl, notify: false };
}
