/**
 * Pure financial derivations for a project. No I/O — every figure the UI, PDFs and
 * Excel export show is computed here from DB rows so they can never disagree.
 */
import type Decimal from "decimal.js";
import type { ClientPayment, Expense, Invoice, InvoiceStatus, Project, QuotationItem } from "@/db/schema";
import { UNALLOCATED_SECTION } from "./constants";
import { D, cents, percentOf, ratio, sum } from "./money";

export type ProjectData = {
  project: Project;
  items: QuotationItem[];
  invoices: Invoice[];
  payments: ClientPayment[];
  expenses: Expense[];
};

// ───────────────────────── Contract (quotation) ─────────────────────────
export function contractTotals(project: Pick<Project, "discountPercent" | "advancePercent">, items: QuotationItem[]) {
  const active = items.filter((i) => i.isActive);
  const gross = sum(active, (i) => i.quotedValue);
  const discountAmount = percentOf(gross, project.discountPercent);
  const net = cents(gross.minus(discountAmount));
  const advanceRequired = percentOf(net, project.advancePercent);
  return {
    gross,
    discountPercent: D(project.discountPercent),
    discountAmount,
    net,
    advancePercent: D(project.advancePercent),
    advanceRequired,
  };
}

/** Group active items by work category, preserving first-seen (sort) order. */
export function groupByCategory(items: QuotationItem[]) {
  const map = new Map<string, QuotationItem[]>();
  for (const it of [...items].sort(bySort)) {
    if (!it.isActive) continue;
    const list = map.get(it.workCategory) ?? [];
    list.push(it);
    map.set(it.workCategory, list);
  }
  return [...map.entries()].map(([category, rows]) => ({
    category,
    rows,
    subtotal: sum(rows, (r) => r.quotedValue),
  }));
}

export function bySort(a: QuotationItem, b: QuotationItem) {
  return a.sortOrder - b.sortOrder || a.itemCode.localeCompare(b.itemCode);
}

// ───────────────────────── Cost budget ─────────────────────────
export type BudgetRow = {
  item: QuotationItem;
  revenue: Decimal;
  plannedCost: Decimal | null;
  expectedProfit: Decimal | null;
  expectedMargin: Decimal | null;
  actualCost: Decimal;
  paid: Decimal;
  remainingBudget: Decimal | null;
  overBudget: boolean;
};

export function budgetRows(items: QuotationItem[], expenses: Expense[]): BudgetRow[] {
  const byItem = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!e.quotationItemId) continue;
    const list = byItem.get(e.quotationItemId) ?? [];
    list.push(e);
    byItem.set(e.quotationItemId, list);
  }
  return [...items]
    .filter((i) => i.isActive)
    .sort(bySort)
    .map((item) => {
      const linked = byItem.get(item.id) ?? [];
      const revenue = D(item.quotedValue);
      const planned = item.plannedCost === null ? null : D(item.plannedCost);
      const actualCost = sum(linked, (e) => e.totalCost);
      const paid = sum(linked, (e) => e.paidToDate);
      const expectedProfit = planned ? revenue.minus(planned) : null;
      const remainingBudget = planned ? planned.minus(actualCost) : null;
      return {
        item,
        revenue,
        plannedCost: planned,
        expectedProfit,
        expectedMargin: expectedProfit ? ratio(expectedProfit, revenue) : null,
        actualCost,
        paid,
        remainingBudget,
        overBudget: remainingBudget ? remainingBudget.isNegative() : false,
      };
    });
}

export function budgetProgress(items: QuotationItem[]) {
  const active = items.filter((i) => i.isActive);
  const completed = active.filter((i) => i.plannedCost !== null).length;
  return { completed, total: active.length, complete: active.length > 0 && completed === active.length };
}

// ───────────────────────── Section P&L ─────────────────────────
export type SectionRow = {
  category: string;
  isOverheads: boolean;
  quotedSales: Decimal;
  budgetedCost: Decimal;
  itemsComplete: number;
  itemsTotal: number;
  /** null until every item in the section has a planned cost. */
  expectedProfit: Decimal | null;
  expectedMargin: Decimal | null;
  costIncurred: Decimal;
  cashPaid: Decimal;
  variance: Decimal;
};

/**
 * Which P&L section an expense belongs to:
 *  - linked to a BOQ item → that item's category
 *  - unlinked but tagged with a quoted category → that section
 *  - otherwise → "Unallocated / Site Overheads"
 * Every expense lands in exactly one row, so section totals reconcile with the dashboard.
 */
export function expenseSection(e: Expense, itemsById: Map<string, QuotationItem>, quotedCategories: Set<string>) {
  if (e.quotationItemId) {
    const it = itemsById.get(e.quotationItemId);
    if (it) return it.workCategory;
  }
  return quotedCategories.has(e.workCategory) ? e.workCategory : UNALLOCATED_SECTION;
}

export function sectionPnl(items: QuotationItem[], expenses: Expense[]) {
  const active = [...items].filter((i) => i.isActive).sort(bySort);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const order: string[] = [];
  for (const it of active) if (!order.includes(it.workCategory)) order.push(it.workCategory);
  const quoted = new Set(order);

  const costs = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = expenseSection(e, itemsById, quoted);
    if (key !== UNALLOCATED_SECTION && !order.includes(key)) order.push(key); // inactive-item category
    const list = costs.get(key) ?? [];
    list.push(e);
    costs.set(key, list);
  }

  const build = (category: string, isOverheads: boolean): SectionRow => {
    const rows = isOverheads ? [] : active.filter((i) => i.workCategory === category);
    const exp = costs.get(category) ?? [];
    const quotedSales = sum(rows, (r) => r.quotedValue);
    const budgetedCost = sum(rows, (r) => r.plannedCost);
    const itemsComplete = rows.filter((r) => r.plannedCost !== null).length;
    const complete = rows.length > 0 && itemsComplete === rows.length;
    const costIncurred = sum(exp, (e) => e.totalCost);
    const expectedProfit = complete ? quotedSales.minus(budgetedCost) : null;
    return {
      category,
      isOverheads,
      quotedSales,
      budgetedCost,
      itemsComplete,
      itemsTotal: rows.length,
      expectedProfit,
      expectedMargin: expectedProfit ? ratio(expectedProfit, quotedSales) : null,
      costIncurred,
      cashPaid: sum(exp, (e) => e.paidToDate),
      variance: budgetedCost.minus(costIncurred),
    };
  };

  const rows = order.map((c) => build(c, false));
  rows.push(build(UNALLOCATED_SECTION, true)); // always present
  const progress = budgetProgress(items);
  const totals = {
    quotedSales: sum(rows, (r) => r.quotedSales),
    budgetedCost: sum(rows, (r) => r.budgetedCost),
    itemsComplete: progress.completed,
    itemsTotal: progress.total,
    costIncurred: sum(rows, (r) => r.costIncurred),
    cashPaid: sum(rows, (r) => r.cashPaid),
    variance: sum(rows, (r) => r.variance),
  };
  return { rows, totals };
}

// ───────────────────────── Invoices ─────────────────────────
export function invoicePaidAmount(invoiceId: string, payments: ClientPayment[]) {
  return sum(
    payments.filter((p) => p.invoiceId === invoiceId),
    (p) => p.amount,
  );
}

/** Status after receipts change. DRAFT stays DRAFT until explicitly issued. */
export function deriveInvoiceStatus(current: InvoiceStatus, amount: string, paid: Decimal): InvoiceStatus {
  if (current === "DRAFT") return "DRAFT";
  if (paid.greaterThanOrEqualTo(D(amount))) return "PAID";
  if (paid.greaterThan(0)) return "PARTIAL";
  return "ISSUED";
}

// ───────────────────────── Executive summary ─────────────────────────
export function projectSummary(data: ProjectData, today: string) {
  const contract = contractTotals(data.project, data.items);
  const progress = budgetProgress(data.items);

  const advanceReceived = sum(
    data.payments.filter((p) => p.paymentType === "ADVANCE"),
    (p) => p.amount,
  );
  const refunds = sum(
    data.payments.filter((p) => p.paymentType === "REFUND"),
    (p) => p.amount,
  );
  const totalReceived = sum(data.payments, (p) => p.amount);
  const advanceOutstanding = D(0).greaterThan(contract.advanceRequired.minus(advanceReceived))
    ? D(0)
    : contract.advanceRequired.minus(advanceReceived);

  const totalBudgeted = sum(
    data.items.filter((i) => i.isActive),
    (i) => i.plannedCost,
  );
  const expectedGrossProfit = progress.complete ? contract.net.minus(totalBudgeted) : null;

  const totalIncurred = sum(data.expenses, (e) => e.totalCost);
  const totalPaidCosts = sum(data.expenses, (e) => e.paidToDate);
  const unpaid = data.expenses.filter((e) => D(e.totalCost).greaterThan(D(e.paidToDate)));
  const overduePayables = unpaid.filter((e) => e.dueDate && e.dueDate < today);

  return {
    contract,
    collections: {
      advanceReceived,
      advanceOutstanding,
      refunds,
      totalReceived,
      outstandingClientBalance: contract.net.minus(totalReceived),
    },
    profitability: {
      progress,
      totalBudgeted,
      expectedGrossProfit,
      expectedGrossMargin: expectedGrossProfit ? ratio(expectedGrossProfit, contract.net) : null,
    },
    cash: {
      totalIncurred,
      totalPaidCosts,
      accountsPayable: totalIncurred.minus(totalPaidCosts),
      overduePayables: sum(overduePayables, (e) => D(e.totalCost).minus(D(e.paidToDate))),
      overdueCount: overduePayables.length,
      netCashPosition: totalReceived.minus(totalPaidCosts),
      unadjustedRevenueLessIncurred: contract.net.minus(totalIncurred),
    },
  };
}

export type ProjectSummary = ReturnType<typeof projectSummary>;
