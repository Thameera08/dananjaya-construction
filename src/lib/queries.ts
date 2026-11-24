import "server-only";
import { cache } from "react";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  clientPayments,
  customers,
  expenseCategories,
  expensePayments,
  expenses,
  expenseTypes,
  labourLoanRecoveries,
  labourLoans,
  invoices,
  projects,
  quotationItems,
  users,
} from "@/db/schema";
import type { ProjectData } from "./finance";
import { isUuid } from "./utils";

/** Everything needed to render any project page — one round-trip batch, deduped per request. */
export const getProjectData = cache(async (id: string) => {
  if (!isUuid(id)) return null;
  const [projectRows, items, inv, pays, exps, loans, loanRecoveries] = await Promise.all([
    db
      .select({ project: projects, customer: customers })
      .from(projects)
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .where(eq(projects.id, id)),
    db.select().from(quotationItems).where(eq(quotationItems.projectId, id)).orderBy(asc(quotationItems.sortOrder), asc(quotationItems.itemCode)),
    db.select().from(invoices).where(eq(invoices.projectId, id)).orderBy(asc(invoices.issueDate), asc(invoices.invoiceNumber)),
    db.select().from(clientPayments).where(eq(clientPayments.projectId, id)).orderBy(asc(clientPayments.paymentDate), asc(clientPayments.receiptCode)),
    db.select().from(expenses).where(eq(expenses.projectId, id)).orderBy(asc(expenses.expenseDate), asc(expenses.costCode)),
    db.select().from(labourLoans).where(eq(labourLoans.projectId, id)).orderBy(asc(labourLoans.loanDate), asc(labourLoans.loanCode)),
    db
      .select({ r: labourLoanRecoveries })
      .from(labourLoanRecoveries)
      .innerJoin(labourLoans, eq(labourLoanRecoveries.loanId, labourLoans.id))
      .where(eq(labourLoans.projectId, id))
      .orderBy(asc(labourLoanRecoveries.recoveryDate), asc(labourLoanRecoveries.createdAt)),
  ]);
  const row = projectRows[0];
  if (!row) return null;
  const data: ProjectData & { customer: typeof row.customer } = {
    project: row.project,
    customer: row.customer,
    items,
    invoices: inv,
    payments: pays,
    expenses: exps,
    loans,
    loanRecoveries: loanRecoveries.map((x) => x.r),
  };
  return data;
});

export async function requireProjectData(id: string) {
  const data = await getProjectData(id);
  if (!data) notFound();
  return data;
}

export async function getExpensePayments(expenseIds: string[]) {
  if (!expenseIds.length) return [];
  return db
    .select()
    .from(expensePayments)
    .where(inArray(expensePayments.expenseId, expenseIds))
    .orderBy(asc(expensePayments.paymentDate), asc(expensePayments.createdAt));
}

/** All projects with raw rows, for the portfolio dashboard. */
export async function getAllProjectsData(): Promise<(ProjectData & { customer: typeof customers.$inferSelect })[]> {
  const [rows, items, inv, pays, exps, loans, recs] = await Promise.all([
    db
      .select({ project: projects, customer: customers })
      .from(projects)
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .orderBy(desc(projects.createdAt)),
    db.select().from(quotationItems),
    db.select().from(invoices),
    db.select().from(clientPayments),
    db.select().from(expenses),
    db.select().from(labourLoans),
    db.select().from(labourLoanRecoveries),
  ]);
  const by = <T extends { projectId: string }>(list: T[], id: string) => list.filter((x) => x.projectId === id);
  return rows.map(({ project, customer }) => ({
    project,
    customer,
    items: by(items, project.id),
    invoices: by(inv, project.id),
    payments: by(pays, project.id),
    expenses: by(exps, project.id),
    loans: by(loans, project.id),
    loanRecoveries: recs.filter((r) => loans.some((l) => l.id === r.loanId && l.projectId === project.id)),
  }));
}

export async function listCustomers() {
  return db.select().from(customers).orderBy(asc(customers.name));
}

export async function listUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

/** Custom cost types + work categories for the expense form pick-lists. */
export async function getExpenseLists() {
  const [types, cats] = await Promise.all([
    db.select().from(expenseTypes).orderBy(asc(expenseTypes.name)),
    db.select().from(expenseCategories).orderBy(asc(expenseCategories.name)),
  ]);
  return { types, categories: cats.map((c) => c.name) };
}
