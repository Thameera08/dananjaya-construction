/**
 * Parser for the "Project Profit & Loss Tracker" Excel workbook
 * (sheets: Quotation Items, Project Setup, Cost Budget, Client Payments, Expense Ledger).
 *
 * Sheets and columns are located by their header text, not fixed positions, so
 * moved columns, extra columns and blank template rows (RC-002…, EX-007…) are fine.
 * Pure: no DB access. Output is plain JSON (money as "1234.50" strings).
 */
import ExcelJS from "exceljs";
import type { CostType, PaymentMethod, PaymentType } from "@/db/schema";
import { D, cents, lineValue, percentOf, toDb } from "./money";

export type ImportItem = {
  itemCode: string;
  workCategory: string;
  description: string;
  unit: string;
  quantity: string;
  clientRate: string;
  quotedValue: string;
  plannedCost: string | null;
  costNotes: string | null;
  sortOrder: number;
};
export type ImportPayment = {
  receiptCode: string;
  paymentDate: string;
  paymentType: PaymentType;
  amount: string;
  paymentMethod: PaymentMethod;
  referenceNo: string | null;
  notes: string | null;
};
export type ImportExpense = {
  costCode: string;
  expenseDate: string;
  workCategory: string;
  itemCode: string | null;
  costType: CostType;
  vendorDetails: string;
  invoiceRef: string | null;
  dueDate: string | null;
  totalCost: string;
  paidToDate: string;
  comments: string | null;
};
export type ImportProject = {
  title: string;
  projectCode: string;
  quotationNumber: string;
  customerCode: string;
  quotationDate: string;
  validUntil: string | null;
  advancePercent: string;
  discountPercent: string;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  contactPerson: string | null;
  phone: string | null;
  siteAddress: string | null;
  exclusionsNotes: string | null;
};
export type ParsedWorkbook = {
  project: ImportProject;
  items: ImportItem[];
  payments: ImportPayment[];
  expenses: ImportExpense[];
  totals: {
    gross: string;
    discount: string;
    net: string;
    advance: string;
    planned: string;
    estimated: number;
    received: string;
    incurred: string;
    paid: string;
  };
  warnings: string[];
  errors: string[];
};

// ───────────────────────── cell helpers ─────────────────────────
type Raw = string | number | boolean | Date | null;

function raw(v: ExcelJS.CellValue): Raw {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return raw(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("error" in v) return null;
    if ("formula" in v || "sharedFormula" in v) return null; // formula without cached value
    return null;
  }
  return v as Raw;
}
function text(v: ExcelJS.CellValue): string {
  const r = raw(v);
  if (r === null) return "";
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  return String(r).replace(/\s+/g, " ").trim();
}
function num(v: ExcelJS.CellValue): number | null {
  const r = raw(v);
  if (typeof r === "number" && Number.isFinite(r)) return r;
  if (typeof r === "string") {
    const s = r.replace(/[,\s]|Rs\.?/gi, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}
/** Excel number → exact 2dp string (Excel stores floats; cents are what matter). */
function money(n: number): string {
  return toDb(D(n.toPrecision(15)));
}
function isoDate(v: ExcelJS.CellValue): string | null {
  const r = raw(v);
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  if (typeof r === "number" && r > 20000 && r < 80000) {
    // Excel serial date
    return new Date(Date.UTC(1899, 11, 30) + r * 864e5).toISOString().slice(0, 10);
  }
  if (typeof r === "string") {
    const s = r.trim();
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // dd/mm/yyyy (Sri Lanka)
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findSheet(wb: ExcelJS.Workbook, ...names: string[]) {
  const wanted = names.map(norm);
  return wb.worksheets.find((ws) => wanted.some((w) => norm(ws.name).includes(w)));
}

/** Locate the header row (the row containing `anchor`) and map normalised header → column. */
function headers(ws: ExcelJS.Worksheet, anchor: string) {
  const a = norm(anchor);
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const row = ws.getRow(r);
    const map = new Map<string, number>();
    row.eachCell((cell, col) => {
      const h = norm(text(cell.value));
      if (h && !map.has(h)) map.set(h, col);
    });
    if (map.has(a)) {
      return {
        row: r,
        col: (...aliases: string[]) => {
          for (const al of aliases) {
            const n = norm(al);
            for (const [h, c] of map) if (h === n || h.startsWith(n)) return c;
          }
          return null;
        },
      };
    }
  }
  return null;
}

function mapPaymentType(s: string): PaymentType | null {
  const t = norm(s);
  if (t.startsWith("adv")) return "ADVANCE";
  if (t.startsWith("prog")) return "PROGRESS";
  if (t.startsWith("fin")) return "FINAL";
  if (t.startsWith("ref")) return "REFUND";
  return null;
}
function mapMethod(s: string): PaymentMethod | null {
  const t = norm(s);
  if (t.startsWith("cash")) return "CASH";
  if (t.includes("cheque") || t.includes("check") || t === "chq") return "CHEQUE";
  if (t.includes("bank") || t.includes("transfer") || t.includes("online") || t.includes("deposit")) return "BANK_TRANSFER";
  return null;
}
function mapCostType(s: string): CostType | null {
  const t = norm(s);
  if (t.startsWith("lab")) return "LABOUR";
  if (t.startsWith("sub")) return "SUBCONTRACTOR";
  if (t.startsWith("sup") || t.startsWith("mat")) return "SUPPLIER";
  if (t.startsWith("oth") || t === "") return "OTHER";
  return null;
}

const ITEM_CODE = /^[A-Z]{1,6}-\d{1,4}$/;

// ───────────────────────── main ─────────────────────────
export async function parseProjectWorkbook(buf: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as ArrayBuffer);
  } catch {
    return empty(["This doesn't look like a valid .xlsx workbook."]);
  }

  // ── Quotation items ──
  const qs = findSheet(wb, "Quotation Items", "Quotation", "BOQ");
  const qh = qs && headers(qs, "Item ID");
  if (!qs || !qh) return empty(['No "Quotation Items" sheet with an "Item ID" header row was found.']);
  const c = {
    code: qh.col("Item ID"),
    cat: qh.col("Work category", "Category"),
    desc: qh.col("Quoted item / specification", "Specification", "Description", "Quoted item"),
    unit: qh.col("Unit"),
    qty: qh.col("Quantity", "Qty"),
    rate: qh.col("Client rate", "Rate"),
    value: qh.col("Quoted value", "Amount", "Value"),
  };
  for (const [k, v] of Object.entries(c)) {
    if (v === null && k !== "value") errors.push(`Quotation Items: column for "${k}" not found.`);
  }

  const items: ImportItem[] = [];
  let sheetGross: number | null = null;
  let discountPercent: string | null = null;
  for (let r = qh.row + 1; r <= qs.rowCount; r++) {
    const row = qs.getRow(r);
    const code = text(row.getCell(c.code!).value).toUpperCase();
    const label = row.values ? (row.values as ExcelJS.CellValue[]).map((v) => text(v ?? null)).join(" ") : "";
    if (ITEM_CODE.test(code)) {
      const where = `Quotation ${code}`;
      const qty = num(row.getCell(c.qty!).value);
      const rate = num(row.getCell(c.rate!).value);
      const given = c.value ? num(row.getCell(c.value).value) : null;
      if (qty === null || qty < 0) errors.push(`${where}: quantity is missing or invalid.`);
      if (rate === null || rate < 0) errors.push(`${where}: client rate is missing or invalid.`);
      if (qty === null || rate === null) continue;
      const quantity = D(qty.toPrecision(15)).toDecimalPlaces(3).toString();
      const clientRate = money(rate);
      const computed = lineValue(quantity, clientRate);
      let quotedValue = toDb(computed);
      if (given !== null && !cents(given).equals(computed)) {
        // e.g. 1,100 sq. ft. × 77.2727… = 85,000 lump sum. Keep the client-facing amount.
        quotedValue = money(given);
        warnings.push(
          `${code}: ${quantity} × Rs. ${clientRate} = ${toDb(computed)}, but the sheet quotes ${quotedValue}. The quoted amount is kept (lump sum); editing this line later will recalculate it from quantity × rate.`,
        );
      }
      items.push({
        itemCode: code,
        workCategory: text(row.getCell(c.cat!).value) || "General",
        description: text(row.getCell(c.desc!).value) || code,
        unit: text(row.getCell(c.unit!).value) || "lot",
        quantity,
        clientRate,
        quotedValue,
        plannedCost: null,
        costNotes: null,
        sortOrder: (items.length + 1) * 10,
      });
    } else if (/discount/i.test(label)) {
      const nums = (row.values as ExcelJS.CellValue[]).map((v) => num(v ?? null)).filter((n): n is number => n !== null);
      const frac = nums.find((n) => n > 0 && n <= 1);
      const fromLabel = /(\d+(?:\.\d+)?)\s*%/.exec(label);
      if (frac !== undefined) discountPercent = D(frac).times(100).toDecimalPlaces(2).toFixed(2);
      else if (fromLabel) discountPercent = D(fromLabel[1]).toFixed(2);
    } else if (/total/i.test(label) && sheetGross === null && c.value) {
      sheetGross = num(row.getCell(c.value).value);
    }
  }
  if (!items.length) errors.push("No BOQ items (rows with an Item ID like GW-001) were found.");
  const dupItems = items.map((i) => i.itemCode).filter((x, i, a) => a.indexOf(x) !== i);
  if (dupItems.length) errors.push(`Duplicate item IDs: ${[...new Set(dupItems)].join(", ")}`);
  if (discountPercent === null) {
    discountPercent = "0.00";
    warnings.push('No "Discount" row found on the Quotation Items sheet, so the discount is set to 0%.');
  }

  // ── Project setup (label / value pairs) ──
  const setup = new Map<string, ExcelJS.CellValue>();
  const ps = findSheet(wb, "Project Setup", "Setup");
  if (ps) {
    ps.eachRow((row) => {
      const cells: ExcelJS.CellValue[] = [];
      row.eachCell((cell) => cells.push(cell.value));
      if (cells.length >= 2 && text(cells[0])) setup.set(norm(text(cells[0])), cells[1]);
    });
  } else {
    warnings.push('No "Project Setup" sheet, so fill in the project details on the Settings page after import.');
  }
  const get = (...keys: string[]) => {
    for (const k of keys) if (setup.has(norm(k))) return setup.get(norm(k))!; // exact label first
    for (const k of keys) for (const [h, v] of setup) if (h.startsWith(norm(k))) return v;
    return null;
  };
  const adv = num(get("Advance required", "Advance"));
  const advancePercent = adv === null ? "75.00" : D(adv <= 1 ? adv * 100 : adv).toDecimalPlaces(2).toFixed(2);
  if (adv === null) warnings.push("Advance % not found, so it defaults to 75%.");
  const ac = text(get("AC works"));
  const exclusionLines = [ac ? `AC works: ${ac}` : "", text(get("Exclusions", "Scope exclusions"))].filter(Boolean);
  const prefix = items[0]?.itemCode.split("-")[0] ?? "PRJ";

  const project: ImportProject = {
    title: text(get("Project", "Project title")) || "Imported project",
    projectCode: prefix,
    quotationNumber: text(get("Quotation number", "Quotation no")) || "",
    customerCode: text(get("Customer ID", "Customer code")).replace(/\.0+$/, ""),
    quotationDate: isoDate(get("Quotation date", "Date")) ?? new Date().toISOString().slice(0, 10),
    validUntil: isoDate(get("Valid until", "Validity")),
    advancePercent,
    discountPercent,
    bankName: text(get("Client payment bank", "Bank")) || null,
    bankAccountNo: text(get("Client payment account", "Account number", "Account no")) || null,
    bankAccountName: text(get("Account name", "Account holder")) || null,
    contactPerson: text(get("Contact person", "Contact")) || null,
    phone: text(get("Contact number", "Phone", "Mobile")) || null,
    siteAddress: text(get("Site address", "Address")) || null,
    exclusionsNotes: exclusionLines.join("\n") || null,
  };
  if (!project.quotationNumber) errors.push('Project Setup: "Quotation number" is missing.');
  if (!isoDate(get("Quotation date", "Date"))) warnings.push("Quotation date not found, so today's date is used.");
  if (!project.customerCode) warnings.push("Customer ID not found, so a new customer code will be assigned.");

  // ── Cost budget ──
  const cb = findSheet(wb, "Cost Budget", "Budget");
  const ch = cb && headers(cb, "Item ID");
  if (cb && ch) {
    const cc = ch.col("Item ID")!;
    const cp = ch.col("Planned cost", "Planned direct cost", "Budget");
    const cn = ch.col("Cost notes", "Notes", "Supplier");
    if (cp === null) warnings.push('Cost Budget: no "Planned cost" column found, so planned costs were skipped.');
    for (let r = ch.row + 1; r <= cb.rowCount; r++) {
      const row = cb.getRow(r);
      const code = text(row.getCell(cc).value).toUpperCase();
      const item = items.find((i) => i.itemCode === code);
      if (!item) continue;
      const planned = cp ? num(row.getCell(cp).value) : null;
      if (planned !== null) {
        if (planned < 0) errors.push(`Cost Budget ${code}: planned cost can't be negative.`);
        else item.plannedCost = money(planned);
      }
      if (cn) item.costNotes = text(row.getCell(cn).value) || null;
    }
  } else {
    warnings.push('No "Cost Budget" sheet, so planned costs are left blank (not estimated).');
  }

  // ── Client payments ──
  const payments: ImportPayment[] = [];
  const cps = findSheet(wb, "Client Payments", "Receipts", "Payments");
  const cph = cps && headers(cps, "Receipt ID");
  if (cps && cph) {
    const k = {
      id: cph.col("Receipt ID")!,
      date: cph.col("Date"),
      type: cph.col("Payment type", "Type"),
      amt: cph.col("Amount received", "Amount"),
      method: cph.col("Payment method", "Method"),
      ref: cph.col("Reference", "Bank slip", "Slip"),
      notes: cph.col("Notes", "Comments"),
    };
    for (let r = cph.row + 1; r <= cps.rowCount; r++) {
      const row = cps.getRow(r);
      const id = text(row.getCell(k.id).value).toUpperCase();
      const amt = k.amt ? num(row.getCell(k.amt).value) : null;
      if (!/^RC-\d+$/.test(id) || amt === null || amt === 0) continue; // empty template rows
      const where = `Receipt ${id}`;
      const date = k.date ? isoDate(row.getCell(k.date).value) : null;
      if (!date) errors.push(`${where}: date is missing or unreadable (use dd/mm/yyyy).`);
      let type = k.type ? mapPaymentType(text(row.getCell(k.type).value)) : null;
      if (!type) {
        type = amt < 0 ? "REFUND" : "PROGRESS";
        warnings.push(`${where}: payment type not recognised, so it's recorded as ${type}.`);
      }
      let method = k.method ? mapMethod(text(row.getCell(k.method).value)) : null;
      if (!method) {
        method = "BANK_TRANSFER";
        warnings.push(`${where}: payment method not recognised, so it's recorded as Bank Transfer.`);
      }
      const abs = cents(Math.abs(amt));
      payments.push({
        receiptCode: id,
        paymentDate: date ?? "",
        paymentType: type,
        amount: toDb(type === "REFUND" ? abs.negated() : abs),
        paymentMethod: method,
        referenceNo: (k.ref && text(row.getCell(k.ref).value)) || null,
        notes: (k.notes && text(row.getCell(k.notes).value)) || null,
      });
    }
  } else {
    warnings.push('No "Client Payments" sheet, so no receipts were imported.');
  }

  // ── Expense ledger ──
  const expenses: ImportExpense[] = [];
  const es = findSheet(wb, "Expense Ledger", "Expenses", "Cost Ledger");
  const eh = es && headers(es, "Cost ID");
  if (es && eh) {
    const k = {
      id: eh.col("Cost ID")!,
      date: eh.col("Date"),
      cat: eh.col("Work category", "Category"),
      item: eh.col("Item ID"),
      type: eh.col("Cost type", "Type"),
      vendor: eh.col("Vendor", "Vendor / expense details", "Details"),
      ref: eh.col("Invoice / ref", "Invoice", "Bill ref", "Ref"),
      due: eh.col("Due date"),
      total: eh.col("Total cost", "Total incurred", "Amount"),
      paid: eh.col("Paid to date", "Paid"),
      comments: eh.col("Comments", "Notes"),
    };
    const quotedCats = new Set(items.map((i) => i.workCategory));
    for (let r = eh.row + 1; r <= es.rowCount; r++) {
      const row = es.getRow(r);
      const id = text(row.getCell(k.id).value).toUpperCase();
      const total = k.total ? num(row.getCell(k.total).value) : null;
      if (!/^EX-\d+$/.test(id) || total === null) continue; // empty template rows
      const where = `Expense ${id}`;
      const paidRaw = k.paid ? num(row.getCell(k.paid).value) : 0;
      const date = k.date ? isoDate(row.getCell(k.date).value) : null;
      if (!date) errors.push(`${where}: date is missing or unreadable (use dd/mm/yyyy).`);
      if (total < 0) errors.push(`${where}: total cost can't be negative.`);
      const paid = paidRaw ?? 0;
      if (paid < 0 || cents(paid).greaterThan(cents(total))) {
        errors.push(`${where}: paid to date (${paid}) must be between 0 and the total cost (${total}).`);
      }
      const category = (k.cat && text(row.getCell(k.cat).value)) || "Misc";
      const rawItem = k.item ? text(row.getCell(k.item).value).toUpperCase() : "";
      let itemCode: string | null = null;
      if (rawItem && rawItem !== "UNALLOCATED") {
        if (items.some((i) => i.itemCode === rawItem)) itemCode = rawItem;
        else {
          warnings.push(
            `${where}: Item ID "${rawItem}" is not a BOQ code (like ${prefix}-001), so it's recorded as ${
              quotedCats.has(category) ? `a ${category} section cost` : "an unallocated site overhead"
            } (category "${category}").`,
          );
        }
      }
      const linkedCat = itemCode ? items.find((i) => i.itemCode === itemCode)!.workCategory : category;
      let costType = k.type ? mapCostType(text(row.getCell(k.type).value)) : "OTHER";
      if (!costType) {
        costType = "OTHER";
        warnings.push(`${where}: cost type not recognised, so it's recorded as Other.`);
      }
      const vendor = (k.vendor && text(row.getCell(k.vendor).value)) || "";
      expenses.push({
        costCode: id,
        expenseDate: date ?? "",
        workCategory: linkedCat,
        itemCode,
        costType,
        vendorDetails: vendor || `${category} (imported)`,
        invoiceRef: (k.ref && text(row.getCell(k.ref).value)) || null,
        dueDate: k.due ? isoDate(row.getCell(k.due).value) : null,
        totalCost: money(total),
        paidToDate: money(Math.max(0, Math.min(paid, total))),
        comments: (k.comments && text(row.getCell(k.comments).value)) || null,
      });
    }
    const blankVendors = expenses.filter((e) => e.vendorDetails.endsWith("(imported)")).length;
    if (blankVendors) warnings.push(`${blankVendors} expense(s) had no vendor details, so the category name is used instead.`);
  } else {
    warnings.push('No "Expense Ledger" sheet, so no expenses were imported.');
  }

  // ── totals & reconciliation ──
  const gross = items.reduce((a, i) => a.plus(i.quotedValue), D(0));
  const discount = percentOf(gross, discountPercent);
  const net = gross.minus(discount);
  if (sheetGross !== null && !cents(sheetGross).equals(cents(gross))) {
    warnings.push(`The sheet's total quoted value (${money(sheetGross)}) differs from the sum of imported items (${toDb(gross)}).`);
  }
  const plannedItems = items.filter((i) => i.plannedCost !== null);
  return {
    project,
    items,
    payments,
    expenses,
    totals: {
      gross: toDb(gross),
      discount: toDb(discount),
      net: toDb(net),
      advance: toDb(percentOf(net, project.advancePercent)),
      planned: toDb(plannedItems.reduce((a, i) => a.plus(i.plannedCost!), D(0))),
      estimated: plannedItems.length,
      received: toDb(payments.reduce((a, p) => a.plus(p.amount), D(0))),
      incurred: toDb(expenses.reduce((a, e) => a.plus(e.totalCost), D(0))),
      paid: toDb(expenses.reduce((a, e) => a.plus(e.paidToDate), D(0))),
    },
    warnings,
    errors,
  };
}

function empty(errors: string[]): ParsedWorkbook {
  const z = "0.00";
  return {
    project: {
      title: "", projectCode: "", quotationNumber: "", customerCode: "", quotationDate: "", validUntil: null,
      advancePercent: "75.00", discountPercent: z, bankName: null, bankAccountNo: null, bankAccountName: null,
      contactPerson: null, phone: null, siteAddress: null, exclusionsNotes: null,
    },
    items: [], payments: [], expenses: [],
    totals: { gross: z, discount: z, net: z, advance: z, planned: z, estimated: 0, received: z, incurred: z, paid: z },
    warnings: [],
    errors,
  };
}
