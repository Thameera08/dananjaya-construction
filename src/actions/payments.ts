"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientPayments, invoices, paymentMethodEnum, paymentTypeEnum, projects } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { D, formatLKR, sum, toDb } from "@/lib/money";
import { isUuid, maxSeq, seqCode } from "@/lib/utils";
import { blobUrlField, fromZod, isoDate, optionalText, positiveMoney, type ActionState } from "@/lib/validation";
import { revalidateProject, run, UserError, withCodeRetry } from "./_run";
import { syncInvoiceStatus } from "./invoices";

const schema = z.object({
  paymentDate: isoDate("Payment date"),
  paymentType: z.enum(paymentTypeEnum.enumValues),
  amount: positiveMoney("Amount"),
  paymentMethod: z.enum(paymentMethodEnum.enumValues),
  referenceNo: optionalText(100),
  invoiceId: z.string().optional(),
  slipBlobUrl: blobUrlField,
  notes: optionalText(1000),
});

export async function createPayment(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageReceipts");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");

    const isRefund = d.paymentType === "REFUND";
    let invoiceId: string | null = null;
    if (isUuid(d.invoiceId)) {
      if (isRefund) throw new UserError("Refunds are not linked to an invoice.");
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, d.invoiceId), eq(invoices.projectId, projectId)));
      if (!inv) throw new UserError("Selected invoice does not belong to this project.");
      if (inv.status === "DRAFT") throw new UserError(`Issue ${inv.invoiceNumber} before recording payments against it.`);
      invoiceId = inv.id;
    }

    if (isRefund) {
      const pays = await db.select().from(clientPayments).where(eq(clientPayments.projectId, projectId));
      const received = sum(pays, (x) => x.amount);
      if (D(d.amount).greaterThan(received)) {
        throw new UserError(`Refund exceeds the net amount received from the client (${formatLKR(received)}).`);
      }
    }

    const code = await withCodeRetry(async () => {
      const rows = await db
        .select({ c: clientPayments.receiptCode })
        .from(clientPayments)
        .where(eq(clientPayments.projectId, projectId));
      const receiptCode = seqCode("RC", maxSeq(rows.map((r) => r.c)) + 1);
      await db.insert(clientPayments).values({
        projectId,
        invoiceId,
        receiptCode,
        paymentDate: d.paymentDate,
        paymentType: d.paymentType,
        amount: isRefund ? toDb(D(d.amount).negated()) : d.amount,
        paymentMethod: d.paymentMethod,
        referenceNo: d.referenceNo,
        slipBlobUrl: d.slipBlobUrl,
        notes: d.notes,
        createdBy: user.id,
      });
      return receiptCode;
    });
    await syncInvoiceStatus(invoiceId);
    revalidateProject(projectId);
    return { ok: true, message: `${code} recorded (${formatLKR(isRefund ? D(d.amount).negated() : d.amount)})` };
  });
}

export async function deletePayment(paymentId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(paymentId)) throw new UserError("Unknown receipt");
    const [pay] = await db.select().from(clientPayments).where(eq(clientPayments.id, paymentId));
    if (!pay) throw new UserError("Unknown receipt");
    await db.delete(clientPayments).where(eq(clientPayments.id, paymentId));
    await syncInvoiceStatus(pay.invoiceId);
    revalidateProject(pay.projectId);
    return { ok: true, message: `${pay.receiptCode} deleted` };
  });
}

export async function attachPaymentSlip(paymentId: string, url: string): Promise<ActionState> {
  return run(async () => {
    await authorize("manageReceipts");
    const parsed = blobUrlField.safeParse(url);
    if (!isUuid(paymentId) || !parsed.success || !parsed.data) throw new UserError("Invalid attachment");
    const [pay] = await db
      .update(clientPayments)
      .set({ slipBlobUrl: parsed.data })
      .where(eq(clientPayments.id, paymentId))
      .returning({ projectId: clientPayments.projectId });
    if (!pay) throw new UserError("Unknown receipt");
    revalidateProject(pay.projectId);
    return { ok: true, message: "Slip attached" };
  });
}
