"use server";

import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { clientPayments, customers, expenses, projects } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { isUuid } from "@/lib/utils";
import {
  fromZod,
  isoDate,
  optionalDate,
  optionalText,
  percentField,
  requiredText,
  type ActionState,
} from "@/lib/validation";
import { isUniqueViolation, revalidateProject, run, uniqueConstraint, UserError } from "./_run";

const bankFields = {
  bankName: optionalText(150),
  bankAccountNo: optionalText(50),
  bankAccountName: optionalText(150),
};

const quotationFields = {
  title: requiredText("Project title", 200),
  siteAddress: optionalText(300),
  quotationNumber: requiredText("Quotation number", 30),
  quotationDate: isoDate("Quotation date"),
  validUntil: optionalDate,
  discountPercent: percentField("Discount %"),
  advancePercent: percentField("Advance %"),
  exclusionsNotes: optionalText(4000),
};

const createSchema = z
  .object({
    projectCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,6}$/, "Project code must be 2–6 letters (used for item IDs, e.g. GW-001)"),
    customerId: z.string().optional(),
    customerName: optionalText(200),
    contactPerson: optionalText(150),
    phone: optionalText(40),
    customerEmail: optionalText(150),
    customerAddress: optionalText(300),
    ...quotationFields,
    ...bankFields,
  })
  .refine((d) => isUuid(d.customerId) || !!d.customerName, {
    path: ["customerName"],
    message: "Select an existing customer or enter a new customer name",
  });

async function nextCustomerCode() {
  const rows = await db.select({ c: customers.customerCode }).from(customers);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.c) || 0), 0) + 1;
  return String(n).padStart(5, "0");
}

export async function createProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let projectId = "";
  const res = await run(async () => {
    await authorize("createProject");
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;

    let customerId = isUuid(d.customerId) ? d.customerId : null;
    if (!customerId) {
      for (let i = 0; i < 4 && !customerId; i++) {
        try {
          const [c] = await db
            .insert(customers)
            .values({
              customerCode: await nextCustomerCode(),
              name: d.customerName!,
              contactPerson: d.contactPerson,
              phone: d.phone,
              email: d.customerEmail,
              address: d.customerAddress,
            })
            .returning({ id: customers.id });
          customerId = c.id;
        } catch (e) {
          if (!isUniqueViolation(e) || i === 3) throw e;
        }
      }
    }

    try {
      const [p] = await db
        .insert(projects)
        .values({
          projectCode: d.projectCode,
          customerId: customerId!,
          title: d.title,
          siteAddress: d.siteAddress,
          quotationNumber: d.quotationNumber,
          quotationDate: d.quotationDate,
          validUntil: d.validUntil,
          discountPercent: d.discountPercent,
          advancePercent: d.advancePercent,
          exclusionsNotes: d.exclusionsNotes,
          bankName: d.bankName,
          bankAccountNo: d.bankAccountNo,
          bankAccountName: d.bankAccountName,
        })
        .returning({ id: projects.id });
      projectId = p.id;
    } catch (e) {
      const c = uniqueConstraint(e);
      if (c !== null) {
        throw new UserError(
          c.includes("quotation_number")
            ? `Quotation number ${d.quotationNumber} is already used by another project.`
            : `Project code ${d.projectCode} is already used by another project.`,
        );
      }
      throw e;
    }
    revalidateProject(projectId);
  });
  if (projectId) redirect(`/projects/${projectId}/quotation`);
  return res;
}

const updateSchema = z.object({
  ...quotationFields,
  ...bankFields,
  contactPerson: optionalText(150),
  phone: optionalText(40),
  customerEmail: optionalText(150),
  customerAddress: optionalText(300),
});

export async function updateProject(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editProject");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const parsed = updateSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");

    const locked = p.status !== "DRAFT";
    const commercialChanged =
      Number(d.discountPercent) !== Number(p.discountPercent) ||
      Number(d.advancePercent) !== Number(p.advancePercent) ||
      d.quotationNumber !== p.quotationNumber;
    if (locked && commercialChanged) {
      throw new UserError(
        "Quotation number, discount and advance % are locked once the quotation is sent. Revert it to DRAFT to revise.",
      );
    }

    await db.batch([
      db
        .update(projects)
        .set({
          title: d.title,
          siteAddress: d.siteAddress,
          quotationNumber: d.quotationNumber,
          quotationDate: d.quotationDate,
          validUntil: d.validUntil,
          discountPercent: d.discountPercent,
          advancePercent: d.advancePercent,
          exclusionsNotes: d.exclusionsNotes,
          bankName: d.bankName,
          bankAccountNo: d.bankAccountNo,
          bankAccountName: d.bankAccountName,
        })
        .where(eq(projects.id, projectId)),
      db
        .update(customers)
        .set({ contactPerson: d.contactPerson, phone: d.phone, email: d.customerEmail, address: d.customerAddress })
        .where(eq(customers.id, p.customerId)),
    ]);
    revalidateProject(projectId);
    return { ok: true, message: "Project details saved" };
  });
}

export async function deleteProject(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let deleted = false;
  const res = await run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== p.projectCode) {
      throw new UserError(`Type the project code (${p.projectCode}) to confirm deletion.`);
    }
    const [[pay], [exp]] = await Promise.all([
      db.select({ n: count() }).from(clientPayments).where(eq(clientPayments.projectId, projectId)),
      db.select({ n: count() }).from(expenses).where(eq(expenses.projectId, projectId)),
    ]);
    if (pay.n > 0 || exp.n > 0) {
      throw new UserError("This project has receipts or expenses recorded. Delete those first to keep the books auditable.");
    }
    await db.delete(projects).where(eq(projects.id, projectId));
    deleted = true;
    revalidateProject(projectId);
  });
  if (deleted) redirect("/projects");
  return res;
}

