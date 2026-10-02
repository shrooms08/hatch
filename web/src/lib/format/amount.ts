// The one formatter for amounts, prices and percentages shown in the Hatch UI.
// Never emits scientific notation.
//   formatAmount(2.222e-8)  -> "0.0₇2222"   (7 zeros after the decimal point, then 4 sig digits)
//   formatAmount(0.004817)  -> "0.004817"
//   formatAmount(9950.3968) -> "9,950.3968"
//   formatPercent(0.4512)   -> "45.12%"
import Decimal from 'decimal.js';

export type Numberish = Decimal | number | string | bigint | { toString(): string };

const SIG_DIGITS = 4;
const MAX_DECIMALS_ABOVE_ONE = 4;
/** Values with at least this many zeros after the decimal point use subscript-zero notation. */
const SUBSCRIPT_MIN_ZEROS = 4;
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

function toDecimal(value: Numberish): Decimal | null {
  try {
    const d = value instanceof Decimal ? value : new Decimal(value.toString());
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

const toSubscript = (n: number) => String(n).replace(/\d/g, (c) => SUBSCRIPT[Number(c)]);
const groupThousands = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatAmount(value: Numberish | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const d = toDecimal(value);
  if (!d) return '-';
  if (d.isZero()) return '0';
  const sign = d.isNeg() ? '-' : '';
  const abs = d.abs();

  if (abs.gte(1)) {
    // Whole part in full with separators; up to 4 decimals, trailing zeros trimmed.
    const [int, frac = ''] = abs.toDecimalPlaces(MAX_DECIMALS_ABOVE_ONE, Decimal.ROUND_HALF_UP).toFixed().split('.');
    const f = frac.replace(/0+$/, '');
    return `${sign}${groupThousands(int)}${f ? `.${f}` : ''}`;
  }

  // Below 1: 4 significant digits after the leading zeros.
  const rounded = abs.toSignificantDigits(SIG_DIGITS, Decimal.ROUND_HALF_UP);
  if (rounded.gte(1)) return `${sign}1`;
  const zeros = -rounded.e - 1; // zeros between the decimal point and the first significant digit
  const digits = rounded.toFixed().slice(2 + zeros).replace(/0+$/, '');
  if (zeros >= SUBSCRIPT_MIN_ZEROS) return `${sign}0.0${toSubscript(zeros)}${digits}`;
  return `${sign}0.${'0'.repeat(zeros)}${digits}`;
}

/** `fraction` is 0..1 (e.g. curve progress). Always 2 decimals. */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '-';
  return `${(fraction * 100).toFixed(2)}%`;
}
