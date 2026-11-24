import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Zero-padded sequential code, e.g. code("RC", 1) → "RC-001". */
export function seqCode(prefix: string, n: number, width = 3) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

/** Highest numeric suffix in a list of codes like GW-012, RC-003. */
export function maxSeq(codes: readonly string[]): number {
  let max = 0;
  for (const c of codes) {
    const m = /-(\d+)$/.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
}

/** Today's date in Sri Lanka (YYYY-MM-DD). */
export function todayLK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Add days to a YYYY-MM-DD date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
