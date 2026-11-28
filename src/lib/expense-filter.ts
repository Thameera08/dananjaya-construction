import type Decimal from "decimal.js";
import type { CostType, Expense } from "@/db/schema";
import { COST_TYPE_LABELS } from "./constants";
import { D, sum } from "./money";

export type ExpenseFilter = {
  /** "base:LABOUR" = every cost counted as labour (incl. custom types); "label:Machinery hire" = one exact type. */
  type?: string;
  category?: string;
  /** BOQ item id or "UNALLOCATED". */
  item?: string;
  q?: string;
  from?: string;
  to?: string;
  status?: "paid" | "unpaid" | "overdue";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read the filter from page searchParams, dropping anything malformed. */
export function parseExpenseFilter(sp: Record<string, string | string[] | undefined>): ExpenseFilter {
  const one = (k: string) => {
    const v = sp[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s : undefined;
  };
  const status = one("status");
  return {
    type: one("type"),
    category: one("category"),
    item: one("item"),
    q: one("q"),
    from: DATE_RE.test(one("from") ?? "") ? one("from") : undefined,
    to: DATE_RE.test(one("to") ?? "") ? one("to") : undefined,
    status: status === "paid" || status === "unpaid" || status === "overdue" ? status : undefined,
  };
}

export const isFiltered = (f: ExpenseFilter) => Object.values(f).some(Boolean);

export const costTypeName = (e: Pick<Expense, "costLabel" | "costType">) => e.costLabel ?? COST_TYPE_LABELS[e.costType];

export function applyExpenseFilter(list: Expense[], f: ExpenseFilter, today: string): Expense[] {
  const q = f.q?.toLowerCase();
  return list.filter((e) => {
    if (f.type?.startsWith("base:") && e.costType !== (f.type.slice(5) as CostType)) return false;
    if (f.type?.startsWith("label:") && costTypeName(e) !== f.type.slice(6)) return false;
    if (f.category && e.workCategory !== f.category) return false;
    if (f.item === "UNALLOCATED" && e.quotationItemId) return false;
    if (f.item && f.item !== "UNALLOCATED" && e.quotationItemId !== f.item) return false;
    if (f.from && e.expenseDate < f.from) return false;
    if (f.to && e.expenseDate > f.to) return false;
    if (q && ![e.vendorDetails, e.invoiceRef, e.comments, e.costCode].some((s) => s?.toLowerCase().includes(q))) return false;
    const unpaid = D(e.totalCost).greaterThan(D(e.paidToDate));
    if (f.status === "paid" && unpaid) return false;
    if (f.status === "unpaid" && !unpaid) return false;
    if (f.status === "overdue" && !(unpaid && e.dueDate && e.dueDate < today)) return false;
    return true;
  });
}

export type Group = { key: string; count: number; incurred: Decimal; paid: Decimal; unpaid: Decimal };

/** Sum expenses per key, largest incurred first. */
export function groupExpenses(list: Expense[], keyOf: (e: Expense) => string): Group[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const k = keyOf(e);
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  }
  return [...map.entries()]
    .map(([key, rows]) => {
      const incurred = sum(rows, (r) => r.totalCost);
      const paid = sum(rows, (r) => r.paidToDate);
      return { key, count: rows.length, incurred, paid, unpaid: incurred.minus(paid) };
    })
    .sort((a, b) => b.incurred.comparedTo(a.incurred));
}

/**
 * Payee name from free-text vendor details: "Sunil (mason): week 3 wages" → "Sunil (mason)".
 * Lets labour payments to the same person roll up together.
 */
export function payeeOf(e: Pick<Expense, "vendorDetails">) {
  const head = e.vendorDetails.split(/\s*[:\-–—|,]\s+|\s*:\s*/)[0]?.trim();
  return head || e.vendorDetails.trim();
}
