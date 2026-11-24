"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  costTypeEnum,
  expensePayments,
  expenses,
  paymentMethodEnum,
  projects,
  quotationItems,
} from "@/db/schema";
import { authorize } from "@/lib/dal";
import { D, formatLKR, toDb } from "@/lib/money";
import { isUuid, maxSeq, seqCode, todayLK } from "@/lib/utils";
import {
  blobUrlField,
  fromZod,
  isoDate,
  moneyField,
  optionalDate,
  optionalMoney,
  optionalText,
  positiveMoney,
  requiredText,
  type ActionState,
} from "@/lib/validation";
import { revalidateProject, run, UserError, withCodeRetry } from "./_run";

const baseFields = {
  expenseDate: isoDate("Date"),
  workCategory: z.string().trim().max(100).optional(),
  quotationItemId: z.string().optional(), // uuid | "UNALLOCATED"
  costType: z.enum(costTypeEnum.enumValues),
  vendorDetails: requiredText("Vendor / details", 300),
  invoiceRef: optionalText(100),
  dueDate: optionalDate,
  totalCost: moneyField("Total incurred cost"),
  comments: optionalText(1000),
};

const createSchema = z.object({
  ...baseFields,
  initialPaid: optionalMoney("Paid now"),
  paymentMethod: z.enum(paymentMethodEnum.enumValues).optional(),
  receiptBlobUrl: blobUrlField,
});

/** Resolve item + category: a linked BOQ item always dictates the work category. */
async function resolveAllocation(projectId: string, itemId: string | undefined, category: string | undefined) {
  if (isUuid(itemId)) {
    const [it] = await db
      .select()
      .from(quotationItems)
      .where(and(eq(quotationItems.id, itemId), eq(quotationItems.projectId, projectId)));
    if (!it) throw new UserError("Selected BOQ item does not belong to this project.");
    return { quotationItemId: it.id, workCategory: it.workCategory };
  }
  if (!category) throw new UserError("Choose a work category for unallocated costs (e.g. Food, Transport).");
  return { quotationItemId: null, workCategory: category };
}

/** Same bill entered twice? Push the user to log a disbursement against the original instead. */
async function assertNoDuplicateBill(projectId: string, invoiceRef: string | null, exceptId?: string) {
  if (!invoiceRef) return;
  const conds = [eq(expenses.projectId, projectId), sql`lower(${expenses.invoiceRef}) = lower(${invoiceRef})`];
  if (exceptId) conds.push(ne(expenses.id, exceptId));
  const [dup] = await db.select({ code: expenses.costCode }).from(expenses).where(and(...conds));
  if (dup) {
    throw new UserError(
      `Bill ref "${invoiceRef}" is already recorded as ${dup.code}. Record a payment against ${dup.code} instead of a new entry.`,
    );
  }
}

export async function createExpense(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageExpenses");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");

    const alloc = await resolveAllocation(projectId, d.quotationItemId, d.workCategory);
    await assertNoDuplicateBill(projectId, d.invoiceRef);
    const paid = d.initialPaid ?? "0.00";
    if (D(paid).greaterThan(D(d.totalCost))) {
      throw new UserError("Paid now cannot exceed the total incurred cost. Record the full bill amount first.");
    }

    const created = await withCodeRetry(async () => {
      const rows = await db.select({ c: expenses.costCode }).from(expenses).where(eq(expenses.projectId, projectId));
      const costCode = seqCode("EX", maxSeq(rows.map((r) => r.c)) + 1);
      const [row] = await db
        .insert(expenses)
        .values({
          projectId,
          ...alloc,
          costCode,
          expenseDate: d.expenseDate,
          costType: d.costType,
          vendorDetails: d.vendorDetails,
          invoiceRef: d.invoiceRef,
          dueDate: d.dueDate,
          totalCost: d.totalCost,
          paidToDate: paid,
          receiptBlobUrl: d.receiptBlobUrl,
          comments: d.comments,
          createdBy: user.id,
        })
        .returning({ id: expenses.id, costCode: expenses.costCode });
      return row;
    });
    if (D(paid).greaterThan(0)) {
      await db.insert(expensePayments).values({
        expenseId: created.id,
        paymentDate: d.expenseDate,
        amount: paid,
        paymentMethod: d.paymentMethod ?? "CASH",
        notes: "Paid at time of entry",
        createdBy: user.id,
      });
    }
    revalidateProject(projectId);
    return { ok: true, message: `${created.costCode} recorded: ${formatLKR(d.totalCost)} incurred, ${formatLKR(paid)} paid` };
  });
}

const paySchema = z.object({
  paymentDate: isoDate("Payment date"),
  amount: positiveMoney("Amount"),
  paymentMethod: z.enum(paymentMethodEnum.enumValues),
  referenceNo: optionalText(100),
  notes: optionalText(500),
});

/**
 * Log a disbursement against an existing bill. A single SQL statement increments
 * paid_to_date only if it stays ≤ total_cost, and writes the audit row in the same statement.
 */
export async function recordExpensePayment(expenseId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageExpenses");
    if (!isUuid(expenseId)) throw new UserError("Unknown expense");
    const parsed = paySchema.safeParse({ paymentDate: todayLK(), ...Object.fromEntries(fd) });
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [e] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    if (!e) throw new UserError("Unknown expense");
    const unpaid = D(e.totalCost).minus(D(e.paidToDate));
    if (D(d.amount).greaterThan(unpaid)) {
      throw new UserError(`Payment exceeds the unpaid balance of ${e.costCode} (${formatLKR(unpaid)}).`);
    }
    const res = await db.execute(sql`
      WITH upd AS (
        UPDATE ${expenses}
           SET paid_to_date = paid_to_date + ${d.amount}::numeric
         WHERE id = ${expenseId} AND paid_to_date + ${d.amount}::numeric <= total_cost
         RETURNING id
      )
      INSERT INTO ${expensePayments} (expense_id, payment_date, amount, payment_method, reference_no, notes, created_by)
      SELECT id, ${d.paymentDate}::date, ${d.amount}::numeric, ${d.paymentMethod}::payment_method, ${d.referenceNo}, ${d.notes}, ${user.id}::uuid
        FROM upd
      RETURNING id
    `);
    if (!res.rows.length) throw new UserError("Balance changed in the meantime — reload and try again.");
    revalidateProject(e.projectId);
    return { ok: true, message: `${formatLKR(d.amount)} paid against ${e.costCode}` };
  });
}

/** Reverse a mistaken disbursement (admin only) — decrements paid_to_date atomically. */
export async function reverseExpensePayment(paymentId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(paymentId)) throw new UserError("Unknown payment");
    const res = await db.execute(sql`
      WITH del AS (DELETE FROM ${expensePayments} WHERE id = ${paymentId} RETURNING expense_id, amount)
      UPDATE ${expenses} e SET paid_to_date = e.paid_to_date - del.amount
        FROM del WHERE e.id = del.expense_id
      RETURNING e.project_id
    `);
    const row = res.rows[0] as { project_id?: string } | undefined;
    if (!row?.project_id) throw new UserError("Payment not found");
    revalidateProject(row.project_id);
    return { ok: true, message: "Disbursement reversed" };
  });
}

const updateSchema = z.object(baseFields);

export async function updateExpense(expenseId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageExpenses");
    if (!isUuid(expenseId)) throw new UserError("Unknown expense");
    const parsed = updateSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [e] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    if (!e) throw new UserError("Unknown expense");
    if (D(d.totalCost).lessThan(D(e.paidToDate))) {
      throw new UserError(`Total cost can't be below the ${formatLKR(e.paidToDate)} already paid. Reverse a payment first.`);
    }
    const alloc = await resolveAllocation(e.projectId, d.quotationItemId, d.workCategory);
    await assertNoDuplicateBill(e.projectId, d.invoiceRef, e.id);
    await db
      .update(expenses)
      .set({
        ...alloc,
        expenseDate: d.expenseDate,
        costType: d.costType,
        vendorDetails: d.vendorDetails,
        invoiceRef: d.invoiceRef,
        dueDate: d.dueDate,
        totalCost: toDb(d.totalCost),
        comments: d.comments,
      })
      .where(eq(expenses.id, expenseId));
    revalidateProject(e.projectId);
    return { ok: true, message: `${e.costCode} updated` };
  });
}

export async function deleteExpense(expenseId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(expenseId)) throw new UserError("Unknown expense");
    const [e] = await db.delete(expenses).where(eq(expenses.id, expenseId)).returning();
    if (!e) throw new UserError("Unknown expense");
    revalidateProject(e.projectId);
    return { ok: true, message: `${e.costCode} deleted` };
  });
}

export async function attachExpenseBill(expenseId: string, url: string): Promise<ActionState> {
  return run(async () => {
    await authorize("manageExpenses");
    const parsed = blobUrlField.safeParse(url);
    if (!isUuid(expenseId) || !parsed.success || !parsed.data) throw new UserError("Invalid attachment");
    const [e] = await db
      .update(expenses)
      .set({ receiptBlobUrl: parsed.data })
      .where(eq(expenses.id, expenseId))
      .returning({ projectId: expenses.projectId });
    if (!e) throw new UserError("Unknown expense");
    revalidateProject(e.projectId);
    return { ok: true, message: "Bill attached" };
  });
}
