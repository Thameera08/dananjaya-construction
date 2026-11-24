import Decimal from "decimal.js";

/**
 * All money math goes through decimal.js (never JS floats).
 * DB NUMERIC(15,2) values arrive as strings and are converted here.
 */
const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;
export type Numeric = Decimal.Value | null | undefined;

export function D(v: Numeric): Decimal {
  if (v === null || v === undefined || v === "") return new Dec(0);
  return new Dec(v);
}

/** Round to cents (half-up, as on a commercial invoice). */
export function cents(v: Numeric): Decimal {
  return D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Serialise to the exact string stored in NUMERIC(15,2). */
export function toDb(v: Numeric): string {
  return cents(v).toFixed(2);
}

export function sum<T>(rows: readonly T[], pick: (row: T) => Numeric): Decimal {
  return rows.reduce((acc, r) => acc.plus(D(pick(r))), new Dec(0));
}

export function lineValue(quantity: Numeric, rate: Numeric): Decimal {
  return cents(D(quantity).times(D(rate)));
}

export function percentOf(base: Numeric, pct: Numeric): Decimal {
  return cents(D(base).times(D(pct)).dividedBy(100));
}

/** Margin % = part / whole × 100, or null when whole is 0. */
export function ratio(part: Numeric, whole: Numeric): Decimal | null {
  const w = D(whole);
  if (w.isZero()) return null;
  return D(part).dividedBy(w).times(100);
}

function groupThousands(intPart: string) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "Rs. 3,134,542.50" — negatives as "-Rs. 1,000.00". */
export function formatLKR(v: Numeric, opts: { prefix?: boolean } = {}): string {
  const d = cents(v);
  const [i, f] = d.abs().toFixed(2).split(".");
  const body = `${groupThousands(i)}.${f}`;
  const sign = d.isNegative() && !d.isZero() ? "-" : "";
  return opts.prefix === false ? `${sign}${body}` : `${sign}Rs. ${body}`;
}

export function formatQty(v: Numeric): string {
  const d = D(v);
  const fixed = d.toDecimalPlaces(3).toString();
  const [i, f] = fixed.split(".");
  return f ? `${groupThousands(i)}.${f}` : groupThousands(i);
}

export function formatPct(v: Decimal | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return "—";
  return `${v.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp)}%`;
}

/** Plain number for charts / Excel cells (display only — never fed back into math). */
export function toNumber(v: Numeric): number {
  return cents(v).toNumber();
}

/** Parse user input like "1,250,000.50" → canonical string, or null if invalid. */
export function parseMoneyInput(raw: unknown, { allowNegative = false } = {}): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[,\s]/g, "").replace(/^Rs\.?/i, "");
  const re = allowNegative ? /^-?\d{1,13}(\.\d{1,2})?$/ : /^\d{1,13}(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  return toDb(s);
}
