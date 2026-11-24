"use server";

import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clientPayments,
  customers,
  expensePayments,
  expenses,
  projects,
  quotationItems,
  quotationStatusEnum,
  type QuotationStatus,
} from "@/db/schema";
import { authorize } from "@/lib/dal";
import { parseProjectWorkbook, type ParsedWorkbook } from "@/lib/excel-import";
import { D } from "@/lib/money";
import { can } from "@/lib/rbac";
import { revalidateProject, run, UserError } from "./_run";

const MAX_BYTES = 4 * 1024 * 1024;

export type ImportState = {
  error?: string;
  preview?: ParsedWorkbook & { conflict: string | null; customerExists: boolean };
};

async function readWorkbook(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the project's .xlsx file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new UserError("Only .xlsx workbooks are supported (save .xls / .csv as .xlsx first).");
  if (file.size > MAX_BYTES) throw new UserError("The workbook must be 4 MB or smaller.");
  return parseProjectWorkbook(await file.arrayBuffer());
}

/** Existing project that would clash on project code or quotation number. */
async function findConflict(p: ParsedWorkbook["project"]) {
  const rows = await db
    .select({ id: projects.id, title: projects.title, code: projects.projectCode, q: projects.quotationNumber })
    .from(projects)
    .where(or(eq(projects.projectCode, p.projectCode), eq(projects.quotationNumber, p.quotationNumber)));
  return rows;
}

export async function previewImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    await authorize("createProject");
    const parsed = await readWorkbook(fd);
    const conflicts = parsed.errors.length ? [] : await findConflict(parsed.project);
    const [cust] = parsed.project.customerCode
      ? await db.select({ id: customers.id }).from(customers).where(eq(customers.customerCode, parsed.project.customerCode))
      : [];
    return {
      preview: {
        ...parsed,
        conflict: conflicts.length
          ? conflicts.map((c) => `${c.title} (code ${c.code}, quotation ${c.q})`).join("; ")
          : null,
        customerExists: !!cust,
      },
    };
  } catch (e) {
    const r = await run(async () => {
      throw e;
    });
    return { error: r.error };
  }
}

export async function runImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  let newId = "";
  const res = await run(async () => {
    const user = await authorize("createProject");
    const parsed = await readWorkbook(fd);
    if (parsed.errors.length) throw new UserError(`Fix these in the workbook first: ${parsed.errors.join(" · ")}`);
    const p = parsed.project;
    const status = (quotationStatusEnum.enumValues as readonly string[]).includes(String(fd.get("status")))
      ? (fd.get("status") as QuotationStatus)
      : "APPROVED";

    // Replacing an existing project wipes its receipts/expenses → admin only, explicit opt-in.
    const conflicts = await findConflict(p);
    const replace = fd.get("replace") === "on";
    if (conflicts.length && !replace) {
      throw new UserError(
        `A project with code ${p.projectCode} or quotation ${p.quotationNumber} already exists. Tick "Replace existing project" to overwrite it.`,
      );
    }
    if (conflicts.length && !can(user.role, "deleteFinancialRecords")) {
      throw new UserError("Only an Admin can replace an existing project.");
    }

    // Customer: reuse by Customer ID, otherwise create.
    const customerName = String(fd.get("customerName") ?? "").trim().slice(0, 200);
    const [existingCustomer] = p.customerCode
      ? await db.select().from(customers).where(eq(customers.customerCode, p.customerCode))
      : [];
    let customerCode = p.customerCode;
    if (!existingCustomer && !customerCode) {
      const all = await db.select({ c: customers.customerCode }).from(customers);
      customerCode = String(all.reduce((m, r) => Math.max(m, Number(r.c) || 0), 0) + 1).padStart(5, "0");
    }
    const customerId = existingCustomer?.id ?? randomUUID();
    const projectId = randomUUID();
    const itemIds = new Map(parsed.items.map((i) => [i.itemCode, randomUUID()]));
    const expenseRows = parsed.expenses.map((e) => ({ ...e, id: randomUUID() }));
    const now = new Date();

    // Everything below runs as ONE transaction (Neon HTTP batch): all-or-nothing.
    const stmts = [];
    if (conflicts.length) stmts.push(db.delete(projects).where(inArray(projects.id, conflicts.map((c) => c.id))));
    if (existingCustomer) {
      stmts.push(
        db
          .update(customers)
          .set({
            ...(customerName ? { name: customerName } : {}),
            contactPerson: p.contactPerson ?? existingCustomer.contactPerson,
            phone: p.phone ?? existingCustomer.phone,
          })
          .where(eq(customers.id, customerId)),
      );
    } else {
      stmts.push(
        db.insert(customers).values({
          id: customerId,
          customerCode,
          name: customerName || p.title,
          contactPerson: p.contactPerson,
          phone: p.phone,
        }),
      );
    }
    stmts.push(
      db.insert(projects).values({
        id: projectId,
        projectCode: p.projectCode,
        customerId,
        title: p.title,
        siteAddress: p.siteAddress,
        status,
        quotationNumber: p.quotationNumber,
        quotationDate: p.quotationDate,
        validUntil: p.validUntil,
        discountPercent: p.discountPercent,
        advancePercent: p.advancePercent,
        bankName: p.bankName,
        bankAccountNo: p.bankAccountNo,
        bankAccountName: p.bankAccountName,
        exclusionsNotes: p.exclusionsNotes,
        approvedAt: status === "APPROVED" ? now : null,
        budgetInitializedAt: status === "APPROVED" ? now : null,
      }),
    );
    stmts.push(
      db.insert(quotationItems).values(
        parsed.items.map((i) => ({ ...i, id: itemIds.get(i.itemCode)!, projectId })),
      ),
    );
    if (parsed.payments.length) {
      stmts.push(
        db.insert(clientPayments).values(parsed.payments.map((x) => ({ ...x, projectId, createdBy: user.id }))),
      );
    }
    if (expenseRows.length) {
      stmts.push(
        db.insert(expenses).values(
          expenseRows.map(({ itemCode, ...e }) => ({
            ...e,
            projectId,
            quotationItemId: itemCode ? itemIds.get(itemCode)! : null,
            createdBy: user.id,
          })),
        ),
      );
      const paid = expenseRows.filter((e) => D(e.paidToDate).greaterThan(0));
      if (paid.length) {
        stmts.push(
          db.insert(expensePayments).values(
            paid.map((e) => ({
              expenseId: e.id,
              paymentDate: e.expenseDate,
              amount: e.paidToDate,
              paymentMethod: "CASH" as const,
              notes: "Paid to date (imported from Excel)",
              createdBy: user.id,
            })),
          ),
        );
      }
    }
    const [first, ...rest] = stmts;
    await db.batch([first, ...rest]);
    newId = projectId;
    revalidateProject(projectId);
  });
  if (newId) redirect(`/projects/${newId}`);
  return { error: res.error };
}
