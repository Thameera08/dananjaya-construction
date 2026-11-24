import "server-only";
import ExcelJS from "exceljs";
import type { Customer } from "@/db/schema";
import { COMPANY } from "./company";
import { COST_TYPE_LABELS, INVOICE_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from "./constants";
import { budgetRows, projectSummary, sectionPnl, type ProjectData } from "./finance";
import { D, toNumber } from "./money";

const MONEY = '#,##0.00;[Red]-#,##0.00';
const PCT = '0.00"%"';

type ColDef = { header: string; key: string; width: number; fmt?: string };

function sheet(wb: ExcelJS.Workbook, name: string, cols: ColDef[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C2230" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  return ws;
}

function boldRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F5" } };
}

const n = (v: Parameters<typeof toNumber>[0]) => toNumber(v);
const pctN = (v: { toNumber(): number } | null) => (v ? Math.round(v.toNumber() * 100) / 100 : null);

export async function buildProjectWorkbook(data: ProjectData & { customer: Customer }, today: string) {
  const s = projectSummary(data, today);
  const pnl = sectionPnl(data.items, data.expenses);
  const budget = budgetRows(data.items, data.expenses);
  const itemsById = new Map(data.items.map((i) => [i.id, i]));

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();

  // 1. Summary
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 44 }, { width: 22 }];
  sum.addRow([`${COMPANY.name} — Project P&L`]).font = { bold: true, size: 14 };
  sum.addRow([data.project.title]).font = { bold: true, size: 12 };
  sum.addRow([`Customer: ${data.customer.name} (${data.customer.customerCode})`]);
  sum.addRow([`Quotation ${data.project.quotationNumber} · Status ${data.project.status} · Generated ${today}`]);
  sum.addRow([]);
  const kv = (label: string, value: number | string | null, fmt = MONEY, bold = false) => {
    const r = sum.addRow([label, value ?? "Pending full BOQ estimation"]);
    if (typeof value === "number") r.getCell(2).numFmt = fmt;
    if (bold) r.font = { bold: true };
  };
  const section = (t: string) => {
    sum.addRow([]);
    const r = sum.addRow([t]);
    r.font = { bold: true, color: { argb: "FFD97706" } };
  };
  section("COLLECTIONS");
  kv("Gross Quoted Value", n(s.contract.gross));
  kv(`Discount (${s.contract.discountPercent.toFixed(2)}%)`, -n(s.contract.discountAmount));
  kv("Net Contract Value", n(s.contract.net), MONEY, true);
  kv(`Advance Required (${s.contract.advancePercent.toFixed(2)}%)`, n(s.contract.advanceRequired));
  kv("Advance Received", n(s.collections.advanceReceived));
  kv("Advance Outstanding", n(s.collections.advanceOutstanding));
  kv("Total Received from Client", n(s.collections.totalReceived), MONEY, true);
  kv("Total Outstanding Client Balance", n(s.collections.outstandingClientBalance));
  section("PROFITABILITY");
  kv("Cost Budget Completed", `${s.profitability.progress.completed} / ${s.profitability.progress.total} items`);
  kv("Total Budgeted Costs", n(s.profitability.totalBudgeted));
  kv("Expected Gross Profit", s.profitability.expectedGrossProfit ? n(s.profitability.expectedGrossProfit) : null, MONEY, true);
  kv("Expected Gross Margin (%)", pctN(s.profitability.expectedGrossMargin), PCT);
  section("CASH & PAYABLES");
  kv("Total Incurred Costs", n(s.cash.totalIncurred));
  kv("Paid Costs (Cash Outflows)", n(s.cash.totalPaidCosts));
  kv("Outstanding Vendor Payments (A/P)", n(s.cash.accountsPayable));
  kv("Net Cash Position", n(s.cash.netCashPosition), MONEY, true);
  kv("Unadjusted Revenue Less Incurred Costs", n(s.cash.unadjustedRevenueLessIncurred));
  sum.addRow([]);
  sum.addRow([
    "Cash Position ≠ Final Net Profit: uncompleted scope, unrecorded bills, and unpaid supplier invoices will affect final project profit.",
  ]).font = { italic: true, color: { argb: "FF9A3412" } };

  // 2. Section P&L
  const ps = sheet(wb, "Section P&L", [
    { header: "Work Category", key: "c", width: 32 },
    { header: "Quoted Sales (Rs.)", key: "q", width: 18, fmt: MONEY },
    { header: "Budgeted Cost (Rs.)", key: "b", width: 18, fmt: MONEY },
    { header: "Budget Items Complete", key: "x", width: 12 },
    { header: "Expected Profit (Rs.)", key: "p", width: 18, fmt: MONEY },
    { header: "Expected Margin (%)", key: "m", width: 12, fmt: PCT },
    { header: "Cost Incurred (Rs.)", key: "i", width: 18, fmt: MONEY },
    { header: "Cash Paid (Rs.)", key: "cp", width: 18, fmt: MONEY },
    { header: "Budget vs Actual Variance (Rs.)", key: "v", width: 20, fmt: MONEY },
  ]);
  for (const r of pnl.rows) {
    ps.addRow({
      c: r.category,
      q: n(r.quotedSales),
      b: n(r.budgetedCost),
      x: r.isOverheads ? "—" : `${r.itemsComplete}/${r.itemsTotal}`,
      p: r.expectedProfit ? n(r.expectedProfit) : r.isOverheads ? null : "Pending",
      m: pctN(r.expectedMargin),
      i: n(r.costIncurred),
      cp: n(r.cashPaid),
      v: n(r.variance),
    });
  }
  boldRow(
    ps.addRow({
      c: "TOTAL (gross)",
      q: n(pnl.totals.quotedSales),
      b: n(pnl.totals.budgetedCost),
      x: `${pnl.totals.itemsComplete}/${pnl.totals.itemsTotal}`,
      i: n(pnl.totals.costIncurred),
      cp: n(pnl.totals.cashPaid),
      v: n(pnl.totals.variance),
    }),
  );
  ps.addRow({ c: `Less: Discount (${s.contract.discountPercent.toFixed(2)}%)`, q: -n(s.contract.discountAmount) });
  boldRow(
    ps.addRow({
      c: "NET CONTRACT",
      q: n(s.contract.net),
      b: n(s.profitability.totalBudgeted),
      p: s.profitability.expectedGrossProfit ? n(s.profitability.expectedGrossProfit) : "Pending",
      m: pctN(s.profitability.expectedGrossMargin),
    }),
  );

  // 3. Quotation BOQ
  const q = sheet(wb, "Quotation BOQ", [
    { header: "Item ID", key: "id", width: 10 },
    { header: "Work Category", key: "c", width: 26 },
    { header: "Specification / Description", key: "d", width: 55 },
    { header: "Unit", key: "u", width: 9 },
    { header: "Quantity", key: "qty", width: 11, fmt: "#,##0.###" },
    { header: "Client Rate (Rs.)", key: "r", width: 16, fmt: MONEY },
    { header: "Quoted Value (Rs.)", key: "v", width: 18, fmt: MONEY },
    { header: "Active", key: "a", width: 8 },
  ]);
  for (const it of data.items) {
    q.addRow({
      id: it.itemCode, c: it.workCategory, d: it.description, u: it.unit,
      qty: D(it.quantity).toNumber(), r: n(it.clientRate), v: n(it.quotedValue), a: it.isActive ? "Yes" : "No",
    });
  }
  boldRow(q.addRow({ d: "Gross Quoted Value", v: n(s.contract.gross) }));
  q.addRow({ d: `Discount (${s.contract.discountPercent.toFixed(2)}%)`, v: -n(s.contract.discountAmount) });
  boldRow(q.addRow({ d: "Net Contract Value", v: n(s.contract.net) }));

  // 4. Cost Budget
  const b = sheet(wb, "Cost Budget", [
    { header: "Item ID", key: "id", width: 10 },
    { header: "Work Category", key: "c", width: 26 },
    { header: "Description", key: "d", width: 48 },
    { header: "Client Revenue (Rs.)", key: "rev", width: 18, fmt: MONEY },
    { header: "Planned Direct Cost (Rs.)", key: "pl", width: 18, fmt: MONEY },
    { header: "Expected Profit (Rs.)", key: "p", width: 18, fmt: MONEY },
    { header: "Expected Margin (%)", key: "m", width: 12, fmt: PCT },
    { header: "Recorded Actual Costs (Rs.)", key: "a", width: 18, fmt: MONEY },
    { header: "Remaining Budget (Rs.)", key: "rem", width: 18, fmt: MONEY },
    { header: "Supplier / Cost Notes", key: "n", width: 36 },
  ]);
  for (const r of budget) {
    b.addRow({
      id: r.item.itemCode, c: r.item.workCategory, d: r.item.description, rev: n(r.revenue),
      pl: r.plannedCost ? n(r.plannedCost) : "Not estimated", p: r.expectedProfit ? n(r.expectedProfit) : null,
      m: pctN(r.expectedMargin), a: n(r.actualCost), rem: r.remainingBudget ? n(r.remainingBudget) : null,
      n: r.item.costNotes ?? "",
    });
  }

  // 5. Expense Ledger
  const e = sheet(wb, "Expense Ledger", [
    { header: "Cost ID", key: "id", width: 9 },
    { header: "Date", key: "dt", width: 11 },
    { header: "Work Category", key: "c", width: 24 },
    { header: "Item ID", key: "it", width: 13 },
    { header: "Cost Type", key: "t", width: 14 },
    { header: "Vendor / Details", key: "v", width: 40 },
    { header: "Invoice / Bill Ref", key: "ref", width: 15 },
    { header: "Due Date", key: "due", width: 11 },
    { header: "Total Incurred (Rs.)", key: "tot", width: 18, fmt: MONEY },
    { header: "Paid to Date (Rs.)", key: "paid", width: 18, fmt: MONEY },
    { header: "Unpaid Balance (Rs.)", key: "un", width: 18, fmt: MONEY },
    { header: "Comments", key: "cm", width: 30 },
  ]);
  for (const x of data.expenses) {
    e.addRow({
      id: x.costCode, dt: x.expenseDate, c: x.workCategory,
      it: x.quotationItemId ? (itemsById.get(x.quotationItemId)?.itemCode ?? "") : "UNALLOCATED",
      t: COST_TYPE_LABELS[x.costType], v: x.vendorDetails, ref: x.invoiceRef ?? "", due: x.dueDate ?? "",
      tot: n(x.totalCost), paid: n(x.paidToDate), un: n(D(x.totalCost).minus(D(x.paidToDate))), cm: x.comments ?? "",
    });
  }
  boldRow(e.addRow({ v: "TOTAL", tot: n(s.cash.totalIncurred), paid: n(s.cash.totalPaidCosts), un: n(s.cash.accountsPayable) }));

  // 6. Client Receipts
  const r = sheet(wb, "Client Receipts", [
    { header: "Receipt ID", key: "id", width: 11 },
    { header: "Date", key: "dt", width: 11 },
    { header: "Payment Type", key: "t", width: 13 },
    { header: "Amount (Rs.)", key: "a", width: 18, fmt: MONEY },
    { header: "Method", key: "m", width: 15 },
    { header: "Reference / Slip No.", key: "ref", width: 22 },
    { header: "Invoice", key: "inv", width: 14 },
    { header: "Notes", key: "n", width: 34 },
  ]);
  const invById = new Map(data.invoices.map((i) => [i.id, i]));
  for (const p of data.payments) {
    r.addRow({
      id: p.receiptCode, dt: p.paymentDate, t: PAYMENT_TYPE_LABELS[p.paymentType], a: n(p.amount),
      m: PAYMENT_METHOD_LABELS[p.paymentMethod], ref: p.referenceNo ?? "",
      inv: p.invoiceId ? (invById.get(p.invoiceId)?.invoiceNumber ?? "") : "", n: p.notes ?? "",
    });
  }
  boldRow(r.addRow({ t: "TOTAL", a: n(s.collections.totalReceived) }));

  // 7. Invoices
  const iv = sheet(wb, "Invoices", [
    { header: "Invoice No.", key: "no", width: 15 },
    { header: "Type", key: "t", width: 18 },
    { header: "Issue Date", key: "d", width: 12 },
    { header: "Due Date", key: "due", width: 12 },
    { header: "Amount (Rs.)", key: "a", width: 18, fmt: MONEY },
    { header: "Status", key: "s", width: 10 },
  ]);
  for (const i of data.invoices) {
    iv.addRow({ no: i.invoiceNumber, t: INVOICE_TYPE_LABELS[i.invoiceType], d: i.issueDate, due: i.dueDate ?? "", a: n(i.amount), s: i.status });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
