"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  expenses,
  labourLoanRecoveries,
  labourLoans,
  loanRecoveryMethodEnum,
  paymentMethodEnum,
  projects,
} from "@/db/schema";
import { authorize } from "@/lib/dal";
import { D, formatLKR } from "@/lib/money";
import { isUuid, maxSeq, seqCode } from "@/lib/utils";
import { fromZod, isoDate, optionalText, positiveMoney, requiredText, type ActionState } from "@/lib/validation";
import { revalidateProject, run, UserError, withCodeRetry } from "./_run";

const loanSchema = z.object({
  workerName: requiredText("Worker name", 120),
  loanDate: isoDate("Date"),
  amount: positiveMoney("Loan amount"),
  paymentMethod: z.enum(paymentMethodEnum.enumValues),
  notes: optionalText(500),
});

/** Record a wage advance / loan given to a worker (LL-xxx). */
export async function createLoan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageExpenses");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const parsed = loanSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");
    const code = await withCodeRetry(async () => {
      const rows = await db.select({ c: labourLoans.loanCode }).from(labourLoans).where(eq(labourLoans.projectId, projectId));
      const loanCode = seqCode("LL", maxSeq(rows.map((r) => r.c)) + 1);
      await db.insert(labourLoans).values({ projectId, loanCode, ...d, createdBy: user.id });
      return loanCode;
    });
    revalidateProject(projectId);
    return { ok: true, message: `${code}: ${formatLKR(d.amount)} loan to ${d.workerName} recorded` };
  });
}

const recoverySchema = z.object({
  recoveryDate: isoDate("Date"),
  amount: positiveMoney("Amount"),
  method: z.enum(loanRecoveryMethodEnum.enumValues),
  expenseId: z.string().optional(),
  notes: optionalText(500),
});

/**
 * Record money recovered from a worker's loan, either deducted from a wage bill or repaid in cash.
 * One SQL statement inserts the recovery only if it keeps total recoveries ≤ the loan amount.
 */
export async function recordLoanRecovery(loanId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageExpenses");
    if (!isUuid(loanId)) throw new UserError("Unknown loan");
    const parsed = recoverySchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [loan] = await db.select().from(labourLoans).where(eq(labourLoans.id, loanId));
    if (!loan) throw new UserError("Unknown loan");

    let expenseId: string | null = null;
    if (d.method === "WAGE_DEDUCTION" && isUuid(d.expenseId)) {
      const [e] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.id, d.expenseId), eq(expenses.projectId, loan.projectId)));
      if (!e) throw new UserError("Selected wage bill does not belong to this project.");
      expenseId = e.id;
    }

    const res = await db.execute(sql`
      INSERT INTO ${labourLoanRecoveries} (loan_id, recovery_date, amount, method, expense_id, notes, created_by)
      SELECT ${loanId}::uuid, ${d.recoveryDate}::date, ${d.amount}::numeric, ${d.method}::loan_recovery_method,
             ${expenseId}::uuid, ${d.notes}, ${user.id}::uuid
       WHERE (SELECT l.amount - COALESCE((SELECT SUM(r.amount) FROM ${labourLoanRecoveries} r WHERE r.loan_id = l.id), 0)
                FROM ${labourLoans} l WHERE l.id = ${loanId}::uuid) >= ${d.amount}::numeric
      RETURNING id
    `);
    if (!res.rows.length) {
      const [{ rec }] = await db
        .select({ rec: sql<string>`COALESCE(SUM(${labourLoanRecoveries.amount}), 0)` })
        .from(labourLoanRecoveries)
        .where(eq(labourLoanRecoveries.loanId, loanId));
      throw new UserError(`Recovery exceeds the outstanding balance of ${loan.loanCode} (${formatLKR(D(loan.amount).minus(D(rec)))}).`);
    }
    revalidateProject(loan.projectId);
    return { ok: true, message: `${formatLKR(d.amount)} recovered from ${loan.workerName} (${loan.loanCode})` };
  });
}

export async function deleteLoan(loanId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(loanId)) throw new UserError("Unknown loan");
    const [l] = await db.delete(labourLoans).where(eq(labourLoans.id, loanId)).returning();
    if (!l) throw new UserError("Unknown loan");
    revalidateProject(l.projectId);
    return { ok: true, message: `${l.loanCode} deleted` };
  });
}

export async function deleteLoanRecovery(recoveryId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(recoveryId)) throw new UserError("Unknown recovery");
    const [r] = await db.delete(labourLoanRecoveries).where(eq(labourLoanRecoveries.id, recoveryId)).returning();
    if (!r) throw new UserError("Unknown recovery");
    const [l] = await db.select({ projectId: labourLoans.projectId }).from(labourLoans).where(eq(labourLoans.id, r.loanId));
    if (l) revalidateProject(l.projectId);
    return { ok: true, message: "Recovery reversed" };
  });
}
