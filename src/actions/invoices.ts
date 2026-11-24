"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientPayments, invoices, invoiceTypeEnum, projects, quotationItems } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { contractTotals, deriveInvoiceStatus, invoicePaidAmount } from "@/lib/finance";
import { D, formatLKR, percentOf, sum, toDb } from "@/lib/money";
import { isUuid, maxSeq } from "@/lib/utils";
import { fromZod, isoDate, optionalDate, optionalMoney, optionalText, type ActionState } from "@/lib/validation";
import { revalidateProject, run, UserError, withCodeRetry } from "./_run";

const schema = z.object({
  invoiceType: z.enum(invoiceTypeEnum.enumValues),
  issueDate: isoDate("Issue date"),
  dueDate: optionalDate,
  amount: optionalMoney("Amount"),
  claimPercent: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim() : null))
    .refine((v) => v === null || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100), "Claim % must be 0–100"),
  notes: optionalText(1000),
});

/** Re-derive an invoice's status from the receipts linked to it. */
export async function syncInvoiceStatus(invoiceId: string | null) {
  if (!invoiceId) return;
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const pays = await db.select().from(clientPayments).where(eq(clientPayments.invoiceId, invoiceId));
  const status = deriveInvoiceStatus(inv.status, inv.amount, invoicePaidAmount(invoiceId, pays));
  if (status !== inv.status) await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
}

export async function createInvoice(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageInvoices");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;

    const [[p], items, existing, pays] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, projectId)),
      db.select().from(quotationItems).where(eq(quotationItems.projectId, projectId)),
      db.select().from(invoices).where(eq(invoices.projectId, projectId)),
      db.select().from(clientPayments).where(eq(clientPayments.projectId, projectId)),
    ]);
    if (!p) throw new UserError("Unknown project");
    if (p.status !== "APPROVED") throw new UserError("Invoices can only be raised on an APPROVED quotation.");

    const c = contractTotals(p, items);
    const received = sum(pays, (x) => x.amount);
    let amount: string;
    if (d.invoiceType === "ADVANCE") {
      if (existing.some((i) => i.invoiceType === "ADVANCE")) {
        throw new UserError("An advance invoice already exists for this project.");
      }
      amount = d.amount ?? toDb(c.advanceRequired);
    } else if (d.invoiceType === "PROGRESS") {
      if (d.amount) amount = d.amount;
      else if (d.claimPercent) amount = toDb(percentOf(c.net, d.claimPercent));
      else throw new UserError("Enter a progress claim amount or a % of the contract value.");
    } else {
      amount = d.amount ?? toDb(c.net.minus(received));
    }
    if (D(amount).lessThanOrEqualTo(0)) throw new UserError("Invoice amount must be greater than zero (contract may already be fully paid).");

    const invoiced = sum(existing, (i) => i.amount).plus(D(amount));
    if (invoiced.greaterThan(c.net)) {
      throw new UserError(
        `Total invoiced (${formatLKR(invoiced)}) would exceed the net contract value (${formatLKR(c.net)}).`,
      );
    }

    const base = p.quotationNumber.replace(/[^A-Za-z0-9]/g, "");
    const number = await withCodeRetry(async () => {
      const rows = await db.select({ n: invoices.invoiceNumber }).from(invoices).where(eq(invoices.projectId, projectId));
      const invoiceNumber = `INV-${base}-${String(maxSeq(rows.map((r) => r.n)) + 1).padStart(2, "0")}`;
      await db.insert(invoices).values({
        projectId,
        invoiceNumber,
        invoiceType: d.invoiceType,
        issueDate: d.issueDate,
        dueDate: d.dueDate,
        amount,
        notes: d.notes,
        status: "DRAFT",
      });
      return invoiceNumber;
    });
    revalidateProject(projectId);
    return { ok: true, message: `${number} created as DRAFT (${formatLKR(amount)}). Issue it to send to the client.` };
  });
}

export async function issueInvoice(invoiceId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageInvoices");
    if (!isUuid(invoiceId)) throw new UserError("Unknown invoice");
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new UserError("Unknown invoice");
    if (inv.status !== "DRAFT") throw new UserError("Invoice is already issued.");
    await db.update(invoices).set({ status: "ISSUED" }).where(eq(invoices.id, invoiceId));
    await syncInvoiceStatus(invoiceId);
    revalidateProject(inv.projectId);
    return { ok: true, message: `${inv.invoiceNumber} issued` };
  });
}

export async function deleteInvoice(invoiceId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageInvoices");
    if (!isUuid(invoiceId)) throw new UserError("Unknown invoice");
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new UserError("Unknown invoice");
    if (inv.status !== "DRAFT") throw new UserError("Only DRAFT invoices can be deleted. Issued invoices are part of the audit trail.");
    await db.delete(invoices).where(eq(invoices.id, invoiceId));
    revalidateProject(inv.projectId);
    return { ok: true, message: `${inv.invoiceNumber} deleted` };
  });
}
