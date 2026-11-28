/**
 * Pure stock derivations. On-hand = sum of signed movement quantities; value uses the
 * weighted-average purchase cost of all priced stock-in rows.
 */
import type Decimal from "decimal.js";
import type { InventoryItem, StockMovement } from "@/db/schema";
import { D, cents, sum } from "./money";

export type StockRow = {
  item: InventoryItem;
  onHand: Decimal;
  totalIn: Decimal;
  totalOut: Decimal;
  avgCost: Decimal | null;
  value: Decimal;
  low: boolean;
};

export function avgUnitCost(movements: StockMovement[]): Decimal | null {
  const priced = movements.filter((m) => m.movementType === "IN" && m.unitCost !== null);
  const qty = sum(priced, (m) => m.quantity);
  if (qty.isZero()) return null;
  return sum(priced, (m) => D(m.quantity).times(D(m.unitCost))).dividedBy(qty);
}

export function stockRows(items: InventoryItem[], movements: StockMovement[]): StockRow[] {
  const byItem = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const list = byItem.get(m.itemId) ?? [];
    list.push(m);
    byItem.set(m.itemId, list);
  }
  return items.map((item) => {
    const ms = byItem.get(item.id) ?? [];
    const onHand = sum(ms, (m) => m.quantity);
    const avgCost = avgUnitCost(ms);
    return {
      item,
      onHand,
      totalIn: sum(ms.filter((m) => D(m.quantity).isPositive()), (m) => m.quantity),
      totalOut: sum(ms.filter((m) => D(m.quantity).isNegative()), (m) => m.quantity).abs(),
      avgCost,
      value: avgCost ? cents(onHand.times(avgCost)) : D(0),
      low: item.reorderLevel !== null && onHand.lessThanOrEqualTo(D(item.reorderLevel)),
    };
  });
}

/** Materials issued to one project, valued at each item's average cost. */
export function projectMaterialUsage(items: InventoryItem[], movements: StockMovement[], projectId: string) {
  const rows = stockRows(items, movements);
  return rows
    .map((r) => {
      const issued = movements.filter((m) => m.itemId === r.item.id && m.projectId === projectId && m.movementType === "OUT");
      const qty = sum(issued, (m) => m.quantity).abs();
      return { item: r.item, qty, value: r.avgCost ? cents(qty.times(r.avgCost)) : null, issues: issued.length };
    })
    .filter((r) => !r.qty.isZero());
}
