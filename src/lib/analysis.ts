/**
 * Plain-language health check of one project, derived from the same figures as the
 * dashboard (projectSummary / sectionPnl) so the analysis never disagrees with the books.
 */
import type { ExpensePayment } from "@/db/schema";
import { groupExpenses, payeeOf } from "./expense-filter";
import { projectSummary, sectionPnl, invoicePaidAmount, type ProjectData } from "./finance";
import { D, formatLKR, formatPct, ratio, sum, toNumber } from "./money";
import { addDays } from "./utils";

export type Insight = { tone: "good" | "warn" | "bad" | "info"; title: string; detail: string; href?: string };

const pctNum = (part: Parameters<typeof D>[0], whole: Parameters<typeof D>[0]) => ratio(part, whole)?.toNumber() ?? 0;

export function analyseProject(data: ProjectData, expensePayments: ExpensePayment[], today: string) {
  const s = projectSummary(data, today);
  const pnl = sectionPnl(data.items, data.expenses);
  const base = `/projects/${data.project.id}`;
  const insights: Insight[] = [];

  // ── Profitability ──
  const p = s.profitability;
  if (!p.progress.complete) {
    insights.push({
      tone: "warn",
      title: "Budget is incomplete",
      detail: `${p.progress.total - p.progress.completed} of ${p.progress.total} BOQ items have no planned cost yet, so expected profit can't be worked out.`,
      href: `${base}/budget`,
    });
  } else if (p.expectedNetMargin) {
    const m = p.expectedNetMargin.toNumber();
    insights.push({
      tone: m < 0 ? "bad" : m < 10 ? "warn" : "good",
      title: m < 0 ? "Project is heading for a loss" : m < 10 ? "Thin profit margin" : "Healthy expected margin",
      detail: `Expected net profit ${formatLKR(p.expectedNetProfit)} (${formatPct(p.expectedNetMargin, 1)} of the contract) after overheads, personal withdrawals and company assets.`,
      href: `${base}/pnl`,
    });
  }

  // ── Sections over / near budget ──
  const sections = pnl.rows.filter((r) => r.kind === "section" && r.budgetedCost.greaterThan(0));
  const over = sections.filter((r) => r.costIncurred.greaterThan(r.budgetedCost));
  const near = sections.filter((r) => !over.includes(r) && pctNum(r.costIncurred, r.budgetedCost) >= 85);
  if (over.length) {
    insights.push({
      tone: "bad",
      title: `${over.length} section${over.length > 1 ? "s" : ""} over budget`,
      detail: over.map((r) => `${r.category} by ${formatLKR(r.costIncurred.minus(r.budgetedCost))}`).join("; ") + ".",
      href: `${base}/pnl`,
    });
  }
  if (near.length) {
    insights.push({
      tone: "warn",
      title: "Sections close to their budget",
      detail: near.map((r) => `${r.category} (${pctNum(r.costIncurred, r.budgetedCost).toFixed(0)}% used)`).join("; ") + ".",
      href: `${base}/pnl`,
    });
  }

  // ── Cash ──
  if (s.cash.netCashPosition.isNegative()) {
    insights.push({
      tone: "bad",
      title: "Paying out more than collected",
      detail: `Cash position is ${formatLKR(s.cash.netCashPosition)}: costs paid plus open labour loans exceed client receipts. The project is running on company money.`,
      href: `${base}/invoices`,
    });
  }
  if (s.collections.advanceOutstanding.greaterThan(0) && data.project.status === "APPROVED") {
    insights.push({
      tone: "warn",
      title: "Advance not fully received",
      detail: `${formatLKR(s.collections.advanceOutstanding)} of the ${s.contract.advancePercent.toFixed(0)}% advance is still outstanding.`,
      href: `${base}/invoices`,
    });
  }
  const overdueInv = data.invoices.filter((i) => (i.status === "ISSUED" || i.status === "PARTIAL") && i.dueDate && i.dueDate < today);
  if (overdueInv.length) {
    const owed = sum(overdueInv, (i) => D(i.amount).minus(invoicePaidAmount(i.id, data.payments)));
    insights.push({
      tone: "bad",
      title: `${overdueInv.length} client invoice${overdueInv.length > 1 ? "s" : ""} overdue`,
      detail: `${formatLKR(owed)} is past due: ${overdueInv.map((i) => i.invoiceNumber).join(", ")}. Follow up with the client.`,
      href: `${base}/invoices`,
    });
  }
  if (s.cash.overdueCount) {
    insights.push({
      tone: "bad",
      title: "Vendor bills overdue",
      detail: `${s.cash.overdueCount} bill(s) totalling ${formatLKR(s.cash.overduePayables)} are past their due date.`,
      href: `${base}/expenses?status=overdue`,
    });
  }

  // ── Billing vs progress ──
  const invoiced = sum(data.invoices, (i) => i.amount);
  const spentPct = pctNum(s.cash.totalIncurred, p.totalBudgeted);
  const billedPct = pctNum(invoiced, s.contract.net);
  if (p.totalBudgeted.greaterThan(0) && spentPct - billedPct >= 15 && invoiced.lessThan(s.contract.net)) {
    insights.push({
      tone: "warn",
      title: "Work is ahead of billing",
      detail: `${spentPct.toFixed(0)}% of the cost budget is spent but only ${billedPct.toFixed(0)}% of the contract is invoiced. Consider raising a progress invoice.`,
      href: `${base}/invoices`,
    });
  }

  // ── Cost mix ──
  const labour = sum(data.expenses.filter((e) => e.costType === "LABOUR"), (e) => e.totalCost);
  const labourShare = pctNum(labour, s.cash.totalIncurred);
  if (labour.greaterThan(0)) {
    insights.push({
      tone: "info",
      title: `Labour is ${labourShare.toFixed(0)}% of costs`,
      detail: `${formatLKR(labour)} spent on labour so far.`,
      href: `${base}/expenses?type=base:LABOUR`,
    });
  }
  if (p.personal.greaterThan(0)) {
    insights.push({
      tone: "info",
      title: "Personal withdrawals from project money",
      detail: `${formatLKR(p.personal)} taken for personal use, deducted from this project's profit.`,
      href: `${base}/expenses?type=base:PERSONAL`,
    });
  }
  if (s.loans.outstanding.greaterThan(0)) {
    insights.push({
      tone: "info",
      title: "Labour loans still open",
      detail: `${formatLKR(s.loans.outstanding)} lent to workers is not yet recovered.`,
      href: `${base}/loans`,
    });
  }

  // ── Activity ──
  const lastExpense = data.expenses.reduce<string | null>((m, e) => (!m || e.expenseDate > m ? e.expenseDate : m), null);
  if (data.project.status === "APPROVED" && lastExpense && lastExpense < addDays(today, -30)) {
    insights.push({ tone: "info", title: "No recent site costs", detail: `No expense has been recorded since ${lastExpense}. Is work paused, or are bills missing?` });
  }

  if (!insights.some((i) => i.tone === "bad" || i.tone === "warn")) {
    insights.unshift({ tone: "good", title: "No problems detected", detail: "Budget, cash and billing all look on track." });
  }
  const rank = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  insights.sort((a, b) => rank[a.tone] - rank[b.tone]);

  // ── Monthly cash flow ──
  const months = new Map<string, { received: number; paid: number; incurred: number }>();
  const bump = (date: string, k: "received" | "paid" | "incurred", v: number) => {
    const key = date.slice(0, 7);
    const m = months.get(key) ?? { received: 0, paid: 0, incurred: 0 };
    m[k] += v;
    months.set(key, m);
  };
  for (const pay of data.payments) bump(pay.paymentDate, "received", toNumber(pay.amount));
  for (const ep of expensePayments) bump(ep.paymentDate, "paid", toNumber(ep.amount));
  for (const e of data.expenses) bump(e.expenseDate, "incurred", toNumber(e.totalCost));
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      month: new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      Received: Math.round(v.received),
      Paid: Math.round(v.paid),
      Incurred: Math.round(v.incurred),
    }));

  const byBase = groupExpenses(data.expenses, (e) => e.costType);
  const labourPayees = groupExpenses(
    data.expenses.filter((e) => e.costType === "LABOUR"),
    payeeOf,
  );
  const sectionHealth = sections.map((r) => ({ ...r, used: pctNum(r.costIncurred, r.budgetedCost) })).sort((a, b) => b.used - a.used);
  const unpaidBills = data.expenses
    .filter((e) => D(e.totalCost).greaterThan(D(e.paidToDate)))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 8);

  return { summary: s, insights, monthly, byBase, labour, labourShare, labourPayees, sectionHealth, unpaidBills, invoiced, spentPct, billedPct };
}
