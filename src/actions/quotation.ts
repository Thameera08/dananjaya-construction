"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expenses, projects, quotationItems, quotationStatusEnum } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { lineValue, toDb } from "@/lib/money";
import { isUuid, maxSeq, seqCode } from "@/lib/utils";
import { fromZod, moneyField, quantityField, requiredText, type ActionState } from "@/lib/validation";
import { revalidateProject, run, UserError, withCodeRetry } from "./_run";

const itemSchema = z.object({
  workCategory: requiredText("Work category", 100),
  description: requiredText("Description", 1000),
  unit: requiredText("Unit", 20),
  quantity: quantityField,
  clientRate: moneyField("Client rate"),
});

async function loadDraftProject(projectId: string) {
  if (!isUuid(projectId)) throw new UserError("Unknown project");
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw new UserError("Unknown project");
  if (p.status !== "DRAFT") {
    throw new UserError(`The quotation is ${p.status}. Revert it to DRAFT before changing BOQ items.`);
  }
  return p;
}

export async function addQuotationItem(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editQuotation");
    const p = await loadDraftProject(projectId);
    const parsed = itemSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const code = await withCodeRetry(async () => {
      const existing = await db
        .select({ c: quotationItems.itemCode, s: quotationItems.sortOrder })
        .from(quotationItems)
        .where(eq(quotationItems.projectId, projectId));
      const n = maxSeq(existing.map((e) => e.c)) + 1;
      const itemCode = seqCode(p.projectCode, n);
      // New items go to the end of their category block.
      const sortOrder = existing.reduce((m, e) => Math.max(m, e.s), 0) + 10;
      await db.insert(quotationItems).values({
        projectId,
        itemCode,
        ...d,
        quotedValue: toDb(lineValue(d.quantity, d.clientRate)),
        sortOrder,
      });
      return itemCode;
    });
    revalidateProject(projectId);
    return { ok: true, message: `${code} added` };
  });
}

export async function updateQuotationItem(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editQuotation");
    if (!isUuid(itemId)) throw new UserError("Unknown item");
    const [it] = await db.select().from(quotationItems).where(eq(quotationItems.id, itemId));
    if (!it) throw new UserError("Unknown item");
    await loadDraftProject(it.projectId);
    const parsed = itemSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    await db
      .update(quotationItems)
      .set({ ...d, quotedValue: toDb(lineValue(d.quantity, d.clientRate)) })
      .where(eq(quotationItems.id, itemId));
    // Keep linked expenses' category consistent with their BOQ item.
    if (d.workCategory !== it.workCategory) {
      await db.update(expenses).set({ workCategory: d.workCategory }).where(eq(expenses.quotationItemId, itemId));
    }
    revalidateProject(it.projectId);
    return { ok: true, message: `${it.itemCode} updated` };
  });
}

/** Deletes an item; if costs are already booked against it, it is deactivated instead. */
export async function removeQuotationItem(itemId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editQuotation");
    if (!isUuid(itemId)) throw new UserError("Unknown item");
    const [it] = await db.select().from(quotationItems).where(eq(quotationItems.id, itemId));
    if (!it) throw new UserError("Unknown item");
    await loadDraftProject(it.projectId);
    const [{ n }] = await db.select({ n: count() }).from(expenses).where(eq(expenses.quotationItemId, itemId));
    if (n > 0) {
      await db.update(quotationItems).set({ isActive: false }).where(eq(quotationItems.id, itemId));
      revalidateProject(it.projectId);
      return { ok: true, message: `${it.itemCode} has ${n} expense(s) booked, so it was deactivated (excluded from totals) instead of deleted.` };
    }
    await db.delete(quotationItems).where(eq(quotationItems.id, itemId));
    revalidateProject(it.projectId);
    return { ok: true, message: `${it.itemCode} deleted` };
  });
}

export async function reactivateQuotationItem(itemId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editQuotation");
    if (!isUuid(itemId)) throw new UserError("Unknown item");
    const [it] = await db.select().from(quotationItems).where(eq(quotationItems.id, itemId));
    if (!it) throw new UserError("Unknown item");
    await loadDraftProject(it.projectId);
    await db.update(quotationItems).set({ isActive: true }).where(eq(quotationItems.id, itemId));
    revalidateProject(it.projectId);
    return { ok: true };
  });
}

const statusField = z.enum(quotationStatusEnum.enumValues);

/** DRAFT → SENT → APPROVED, plus revert-to-DRAFT for revisions. Approval initialises the cost budget. */
export async function setQuotationStatus(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("editQuotation");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const target = statusField.parse(fd.get("status"));
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");

    const allowed: Record<string, string[]> = { DRAFT: ["SENT"], SENT: ["APPROVED", "DRAFT"], APPROVED: ["DRAFT"] };
    if (!allowed[p.status].includes(target)) throw new UserError(`Can't move a ${p.status} quotation to ${target}.`);
    if ((target === "APPROVED" || p.status === "APPROVED") && !can(user.role, "approveQuotation")) {
      throw new UserError("Only an Admin can approve a quotation or re-open an approved one.");
    }
    if (target === "SENT") {
      const [{ n }] = await db
        .select({ n: count() })
        .from(quotationItems)
        .where(and(eq(quotationItems.projectId, projectId), eq(quotationItems.isActive, true)));
      if (n === 0) throw new UserError("Add at least one BOQ item before sending the quotation.");
    }

    const now = new Date();
    await db
      .update(projects)
      .set({
        status: target,
        ...(target === "APPROVED" ? { approvedAt: now, budgetInitializedAt: p.budgetInitializedAt ?? now } : {}),
        ...(target === "DRAFT" ? { approvedAt: null } : {}),
      })
      .where(eq(projects.id, projectId));
    revalidateProject(projectId);
    const msg =
      target === "APPROVED"
        ? "Quotation approved — the cost budget is now open for estimation."
        : target === "SENT"
          ? "Quotation marked as sent to client."
          : "Quotation reverted to DRAFT for revision.";
    return { ok: true, message: msg };
  });
}
