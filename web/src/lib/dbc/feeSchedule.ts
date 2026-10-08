// The DBC base-fee schedule of a config ("Sniper shield" when it decays), and the fee in force now.
// The fee itself is computed with the SDK's getBaseFeeNumerator, i.e. the program's own math.
import BN from 'bn.js';
import { getBaseFeeNumerator, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk';

const FEE_DENOMINATOR = 1_000_000_000;

/** Serializable fee schedule (strings for u64 values). null periodFrequency => flat fee. */
export type FeeSchedule = {
  mode: number; // 0 linear, 1 exponential (fee scheduler); 2 rate limiter (not used by Hatch)
  cliffFeeNumerator: string;
  numberOfPeriod: number;
  periodFrequency: string;
  reductionFactor: string;
  activationType: number; // 0 slot, 1 timestamp
};

export function feeScheduleOf(config: PoolConfig): FeeSchedule {
  const b = config.poolFees.baseFee;
  return {
    mode: b.baseFeeMode,
    cliffFeeNumerator: b.cliffFeeNumerator.toString(),
    numberOfPeriod: b.firstFactor,
    periodFrequency: b.secondFactor.toString(),
    reductionFactor: b.thirdFactor.toString(),
    activationType: config.activationType,
  };
}

/** A decaying fee-scheduler schedule (the sniper shield), as opposed to a flat base fee. */
export const hasSniperShield = (f: FeeSchedule | null | undefined): f is FeeSchedule =>
  !!f && (f.mode === 0 || f.mode === 1) && f.periodFrequency !== '0' && f.numberOfPeriod > 0;

/** Base fee (%) at `currentPoint` (unix seconds for timestamp-activated pools). */
export function baseFeePercentAt(f: FeeSchedule, activationPoint: string, currentPoint: number): number {
  const n = getBaseFeeNumerator(
    new BN(f.cliffFeeNumerator),
    f.numberOfPeriod,
    new BN(f.periodFrequency),
    new BN(f.reductionFactor),
    f.mode,
    BN.max(new BN(Math.floor(currentPoint)), new BN(activationPoint)),
    new BN(activationPoint)
  );
  return (Number(n.toString()) / FEE_DENOMINATOR) * 100;
}

/** Seconds (or slots) from activation until the schedule reaches its final fee. */
export const shieldDuration = (f: FeeSchedule) => f.numberOfPeriod * Number(f.periodFrequency);

/** Starting and final fee (%) of a schedule. */
export function shieldRange(f: FeeSchedule): { start: number; end: number } {
  return { start: baseFeePercentAt(f, '0', 0), end: baseFeePercentAt(f, '0', shieldDuration(f)) };
}

/** The one plain line shown with the Sniper shield badge. */
export const SNIPER_SHIELD_LINE = 'Fees start high for the first minute so bots pay, then drop to 1%.';

/** How fees work, in one sentence: v2 configs (Sniper shield) vs legacy flat-fee configs. */
export const shieldFeeSentence = (start = '50%', end = '1%') => `Fees start at ${start} for the first minute so bots pay, then ${end} per trade, split with Hatch.`;
export const LEGACY_FEE_SENTENCE = '1% fee per trade, split with Hatch.';

/** "36%", "7.1%", "1%". */
export const formatFeePercent = (p: number) => `${Number(p.toFixed(p < 10 ? 1 : 0))}%`;
