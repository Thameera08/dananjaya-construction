import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ClientPayment, Customer, Invoice, Project, QuotationItem } from "@/db/schema";
import { COMPANY } from "./company";
import { INVOICE_TYPE_LABELS } from "./constants";
import { contractTotals, groupByCategory } from "./finance";
import { D, formatLKR, formatQty, sum } from "./money";
import { formatDate } from "./utils";

// A4 portrait, points
const W = 595.28;
const H = 841.89;
const M = 40;
const CONTENT_W = W - M * 2;

const INK = rgb(0.11, 0.13, 0.17);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.95, 0.96, 0.97);
const ACCENT = rgb(0.85, 0.47, 0.02);

/** Standard PDF fonts are WinAnsi-only: normalise typographic characters, drop the rest. */
function clean(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/²/g, "2")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

type Align = "left" | "right" | "center";
type Col = { header: string; width: number; align?: Align };
type CellRow = { cells: string[]; bold?: boolean; fill?: boolean; span?: boolean };

class Doc {
  pdf!: PDFDocument;
  page!: PDFPage;
  regular!: PDFFont;
  bold!: PDFFont;
  y = H - M;

  static async create(title: string) {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(clean(title));
    d.pdf.setProducer(clean(COMPANY.name));
    d.pdf.setCreator(clean(COMPANY.name));
    d.regular = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.newPage();
    return d;
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.y = H - M;
  }

  ensure(h: number, onBreak?: () => void) {
    if (this.y - h < M + 24) {
      this.newPage();
      onBreak?.();
    }
  }

  width(s: string, size: number, bold = false) {
    return (bold ? this.bold : this.regular).widthOfTextAtSize(clean(s), size);
  }

  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: Align; w?: number } = {}) {
    const size = o.size ?? 9;
    const font = o.bold ? this.bold : this.regular;
    const str = clean(s);
    let dx = x;
    if (o.align && o.align !== "left" && o.w) {
      const tw = font.widthOfTextAtSize(str, size);
      dx = o.align === "right" ? x + o.w - tw : x + (o.w - tw) / 2;
    }
    this.page.drawText(str, { x: dx, y, size, font, color: o.color ?? INK });
  }

  wrap(s: string, maxW: number, size: number, bold = false): string[] {
    const font = bold ? this.bold : this.regular;
    const out: string[] = [];
    for (const para of clean(s).split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const cand = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(cand, size) <= maxW) line = cand;
        else {
          if (line) out.push(line);
          // hard-break very long tokens
          let w = word;
          while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
            let i = w.length;
            while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--;
            out.push(w.slice(0, i));
            w = w.slice(i);
          }
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }

  paragraph(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; w?: number } = {}) {
    const size = o.size ?? 9;
    const lines = this.wrap(s, o.w ?? CONTENT_W, size, o.bold);
    for (const l of lines) {
      this.ensure(size + 3);
      this.y -= size + 3;
      this.text(l, o.x ?? M, this.y, { size, bold: o.bold, color: o.color });
    }
  }

  rule(color = LINE, thickness = 0.75) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness, color });
  }

  heading(s: string) {
    this.ensure(30);
    this.y -= 18;
    this.text(s.toUpperCase(), M, this.y, { size: 9, bold: true, color: ACCENT });
    this.y -= 5;
    this.rule();
  }

  table(cols: Col[], rows: CellRow[], size = 8.5) {
    const pad = 4;
    const drawHeader = () => {
      const h = size + pad * 2 + 2;
      this.page.drawRectangle({ x: M, y: this.y - h, width: CONTENT_W, height: h, color: INK });
      let x = M;
      for (const c of cols) {
        this.text(c.header, x + pad, this.y - h + pad + 2, { size, bold: true, color: rgb(1, 1, 1), align: c.align, w: c.width - pad * 2 });
        x += c.width;
      }
      this.y -= h;
    };
    this.ensure(40);
    drawHeader();
    for (const r of rows) {
      const wrapped = r.span
        ? [this.wrap(r.cells[0], CONTENT_W - pad * 2, size, r.bold)]
        : cols.map((c, i) => this.wrap(r.cells[i] ?? "", c.width - pad * 2, size, r.bold));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = lines * (size + 2.5) + pad * 2;
      this.ensure(h, drawHeader);
      if (r.fill) this.page.drawRectangle({ x: M, y: this.y - h, width: CONTENT_W, height: h, color: BAND });
      let x = M;
      const widths = r.span ? [CONTENT_W] : cols.map((c) => c.width);
      wrapped.forEach((cellLines, i) => {
        const align = r.span ? "left" : cols[i].align;
        cellLines.forEach((ln, li) => {
          this.text(ln, x + pad, this.y - pad - size - li * (size + 2.5) + 1, { size, bold: r.bold, align, w: widths[i] - pad * 2 });
        });
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.5, color: LINE });
    }
  }

  /** Right-aligned label/value summary block. */
  totals(rows: { label: string; value: string; bold?: boolean; accent?: boolean }[]) {
    const labelW = 200;
    const valW = 110;
    const x = W - M - labelW - valW;
    for (const r of rows) {
      this.ensure(18);
      this.y -= 16;
      if (r.accent) {
        this.page.drawRectangle({ x: x - 6, y: this.y - 5, width: labelW + valW + 6, height: 18, color: BAND });
      }
      this.text(r.label, x, this.y, { size: 9.5, bold: r.bold, w: labelW });
      this.text(r.value, x + labelW, this.y, { size: 9.5, bold: r.bold, align: "right", w: valW });
    }
  }

  letterhead(docTitle: string, meta: [string, string][]) {
    this.text(COMPANY.name, M, this.y - 16, { size: 17, bold: true });
    let ly = this.y - 30;
    for (const l of [COMPANY.address, [COMPANY.phone, COMPANY.email].filter(Boolean).join("  |  ")].filter(Boolean)) {
      this.text(l, M, ly, { size: 8.5, color: MUTED });
      ly -= 11;
    }
    this.text(docTitle, W - M - 200, this.y - 16, { size: 16, bold: true, color: ACCENT, align: "right", w: 200 });
    let my = this.y - 32;
    for (const [k, v] of meta) {
      this.text(k, W - M - 200, my, { size: 8.5, color: MUTED, w: 90 });
      this.text(v, W - M - 110, my, { size: 8.5, bold: true, align: "right", w: 110 });
      my -= 12;
    }
    this.y = Math.min(ly, my) - 6;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 1.5, color: ACCENT });
  }

  partyBlock(customer: Customer, project: Project) {
    const top = this.y - 14;
    this.text("BILL TO", M, top, { size: 7.5, bold: true, color: MUTED });
    const left = [
      customer.name,
      `Customer ID: ${customer.customerCode}`,
      customer.contactPerson ? `Attn: ${customer.contactPerson}` : "",
      customer.phone ?? "",
      customer.address ?? "",
    ].filter(Boolean);
    left.forEach((l, i) => this.text(l, M, top - 12 - i * 11, { size: 9, bold: i === 0 }));
    const rx = M + CONTENT_W / 2 + 10;
    this.text("PROJECT", rx, top, { size: 7.5, bold: true, color: MUTED });
    const right = [project.title, project.siteAddress ? `Site: ${project.siteAddress}` : "", `Currency: ${project.currency}`].filter(Boolean);
    let ry = top - 12;
    for (const [i, l] of right.entries()) {
      for (const wl of this.wrap(l, CONTENT_W / 2 - 10, 9, i === 0)) {
        this.text(wl, rx, ry, { size: 9, bold: i === 0 });
        ry -= 11;
      }
    }
    this.y = Math.min(top - 12 - left.length * 11, ry) - 4;
  }

  bankBlock(project: Project) {
    if (!project.bankName && !project.bankAccountNo) return;
    this.heading("Bank transfer details");
    const rows: [string, string][] = [
      ["Bank", project.bankName ?? "—"],
      ["Account number", project.bankAccountNo ?? "—"],
      ["Account name", project.bankAccountName ?? "—"],
    ];
    for (const [k, v] of rows) {
      this.ensure(14);
      this.y -= 13;
      this.text(k, M, this.y, { size: 9, color: MUTED });
      this.text(v, M + 110, this.y, { size: 9, bold: true });
    }
    this.y -= 4;
    this.paragraph("Please quote the invoice / quotation number as the payment reference and share the bank slip with us.", {
      size: 8,
      color: MUTED,
    });
  }

  async finish() {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const s = clean(`${COMPANY.name}  -  Page ${i + 1} of ${pages.length}`);
      const tw = this.regular.widthOfTextAtSize(s, 7.5);
      p.drawText(s, { x: (W - tw) / 2, y: M / 2, size: 7.5, font: this.regular, color: MUTED });
    });
    return this.pdf.save();
  }
}

/** "-Rs. 1,000.00" for deductions, but plain "Rs. 0.00" when nothing is deducted. */
const less = (v: Parameters<typeof D>[0]) => (D(v).isZero() ? formatLKR(0) : `-${formatLKR(v)}`);

// ─────────────────────────── Quotation ───────────────────────────
export async function renderQuotationPdf(project: Project, customer: Customer, items: QuotationItem[]) {
  const t = contractTotals(project, items);
  const doc = await Doc.create(`Quotation ${project.quotationNumber} - ${project.title}`);
  doc.letterhead("QUOTATION", [
    ["Quotation No.", project.quotationNumber],
    ["Date", formatDate(project.quotationDate)],
    ["Valid until", formatDate(project.validUntil)],
    ["Status", project.status],
  ]);
  doc.partyBlock(customer, project);

  const cols: Col[] = [
    { header: "Item ID", width: 52 },
    { header: "Specification / Description", width: 213 },
    { header: "Unit", width: 45, align: "center" },
    { header: "Qty", width: 50, align: "right" },
    { header: "Rate (Rs.)", width: 72, align: "right" },
    { header: "Amount (Rs.)", width: CONTENT_W - 432, align: "right" },
  ];
  const rows: CellRow[] = [];
  for (const g of groupByCategory(items)) {
    rows.push({ cells: [g.category], bold: true, fill: true, span: true });
    for (const r of g.rows) {
      rows.push({
        cells: [
          r.itemCode,
          r.description,
          r.unit,
          formatQty(r.quantity),
          formatLKR(r.clientRate, { prefix: false }),
          formatLKR(r.quotedValue, { prefix: false }),
        ],
      });
    }
    rows.push({ cells: ["", `Subtotal - ${g.category}`, "", "", "", formatLKR(g.subtotal, { prefix: false })], bold: true });
  }
  doc.y -= 8;
  doc.table(cols, rows);

  doc.totals([
    { label: "Gross Quoted Value", value: formatLKR(t.gross) },
    { label: `Discount (${t.discountPercent.toFixed(2)}%)`, value: less(t.discountAmount) },
    { label: "Net Contract Value", value: formatLKR(t.net), bold: true, accent: true },
  ]);

  if (project.exclusionsNotes) {
    doc.heading("Scope exclusions");
    doc.paragraph(project.exclusionsNotes);
  }

  doc.heading("Payment terms");
  doc.paragraph(
    `${t.advancePercent.toFixed(0)}% advance (${formatLKR(t.advanceRequired)}) is payable before project commencement. ` +
      "The balance is payable through progress invoices as work is completed, with the final invoice on handover.",
  );
  doc.paragraph(
    `This quotation is valid until ${formatDate(project.validUntil)}. Any work outside the quoted scope will be quoted separately.`,
    { color: MUTED, size: 8.5 },
  );
  doc.bankBlock(project);

  doc.ensure(70);
  doc.y -= 50;
  const sigW = 180;
  doc.page.drawLine({ start: { x: M, y: doc.y }, end: { x: M + sigW, y: doc.y }, thickness: 0.75, color: INK });
  doc.page.drawLine({ start: { x: W - M - sigW, y: doc.y }, end: { x: W - M, y: doc.y }, thickness: 0.75, color: INK });
  doc.text(`For ${COMPANY.name}`, M, doc.y - 12, { size: 8.5, color: MUTED });
  doc.text("Accepted by client (signature & date)", W - M - sigW, doc.y - 12, { size: 8.5, color: MUTED });

  return doc.finish();
}

// ─────────────────────────── Invoice ───────────────────────────
export async function renderInvoicePdf(
  project: Project,
  customer: Customer,
  items: QuotationItem[],
  invoice: Invoice,
  invoicesAll: Invoice[],
  payments: ClientPayment[],
) {
  const t = contractTotals(project, items);
  const linked = payments.filter((p) => p.invoiceId === invoice.id);
  const prior = payments.filter((p) => p.invoiceId !== invoice.id && p.paymentDate <= invoice.issueDate);
  const priorReceived = sum(prior, (p) => p.amount);
  const paidOnThis = sum(linked, (p) => p.amount);
  const balanceBefore = t.net.minus(priorReceived);
  const amount = D(invoice.amount);
  const dueOnThis = amount.minus(paidOnThis);
  const invoicedToDate = sum(
    invoicesAll.filter((i) => i.issueDate <= invoice.issueDate),
    (i) => i.amount,
  );

  const title = INVOICE_TYPE_LABELS[invoice.invoiceType].toUpperCase();
  const doc = await Doc.create(`${invoice.invoiceNumber} - ${project.title}`);
  doc.letterhead(invoice.status === "DRAFT" ? `${title} (DRAFT)` : title, [
    ["Invoice No.", invoice.invoiceNumber],
    ["Issue date", formatDate(invoice.issueDate)],
    ["Due date", formatDate(invoice.dueDate)],
    ["Quotation ref.", project.quotationNumber],
  ]);
  doc.partyBlock(customer, project);

  const desc =
    invoice.invoiceType === "ADVANCE"
      ? `${t.advancePercent.toFixed(2)}% advance payment on Net Contract Value of ${formatLKR(t.net)} (Quotation ${project.quotationNumber}), payable before project commencement.`
      : invoice.invoiceType === "PROGRESS"
        ? `Progress claim for works completed to date on ${project.title} (Quotation ${project.quotationNumber}).`
        : `Final account: balance of contract on completion of ${project.title} (Quotation ${project.quotationNumber}).`;
  doc.y -= 8;
  doc.table(
    [
      { header: "Description", width: CONTENT_W - 120 },
      { header: "Amount (Rs.)", width: 120, align: "right" },
    ],
    [
      { cells: [desc + (invoice.notes ? `\n${invoice.notes}` : ""), formatLKR(amount, { prefix: false })] },
      { cells: ["Amount of this invoice", formatLKR(amount, { prefix: false })], bold: true, fill: true },
    ],
    9,
  );

  doc.heading("Contract account");
  doc.totals([
    { label: "Net Contract Value", value: formatLKR(t.net) },
    { label: "Less: receipts prior to this invoice", value: less(priorReceived) },
    { label: "Contract balance before this invoice", value: formatLKR(balanceBefore), bold: true },
    { label: "This invoice", value: formatLKR(amount) },
    ...(paidOnThis.isZero() ? [] : [{ label: "Less: received against this invoice", value: less(paidOnThis) }]),
    { label: "AMOUNT DUE ON THIS INVOICE", value: formatLKR(dueOnThis.isNegative() ? 0 : dueOnThis), bold: true, accent: true },
    { label: "Contract balance after this invoice", value: formatLKR(balanceBefore.minus(amount)) },
    { label: "Total invoiced to date (incl. this)", value: formatLKR(invoicedToDate) },
  ]);

  if (prior.length || linked.length) {
    doc.heading("Receipts on account");
    doc.table(
      [
        { header: "Receipt", width: 70 },
        { header: "Date", width: 80 },
        { header: "Type", width: 80 },
        { header: "Reference", width: CONTENT_W - 350 },
        { header: "Amount (Rs.)", width: 120, align: "right" },
      ],
      [...prior, ...linked].map((p) => ({
        cells: [p.receiptCode, formatDate(p.paymentDate), p.paymentType, p.referenceNo ?? "", formatLKR(p.amount, { prefix: false })],
      })),
    );
  }

  doc.bankBlock(project);
  doc.y -= 10;
  doc.paragraph("This is a computer-generated invoice.", { size: 8, color: MUTED });
  return doc.finish();
}
