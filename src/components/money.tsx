import type { Numeric } from "@/lib/money";
import { D, formatLKR } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Formatted LKR amount. `signTone` colours negatives red / positives green. */
export function Money({
  value,
  prefix = true,
  signTone,
  className,
}: {
  value: Numeric;
  prefix?: boolean;
  signTone?: boolean;
  className?: string;
}) {
  const d = D(value);
  const tone = signTone ? (d.isNegative() && !d.isZero() ? "text-danger" : d.isZero() ? "" : "text-success") : d.isNegative() && !d.isZero() ? "text-danger" : "";
  return <span className={cn("tabular-nums", tone, className)}>{formatLKR(d, { prefix })}</span>;
}
