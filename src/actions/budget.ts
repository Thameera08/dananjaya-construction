"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, quotationItems } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { parseMoneyInput } from "@/lib/money";
import { isUuid } from "@/lib/utils";
import type { ActionState } from "@/lib/validation";
import { revalidateProject, run, UserError } from "./_run";

/**
 * Saves the whole cost budget form. Inputs are named planned_<itemId> / notes_<itemId>.
 * Blank planned cost = "not yet estimated" (NULL); 0 is an explicit estimate.
 */
export async function saveBudget(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("editBudget");
    if (!isUuid(projectId)) throw new UserError("Unknown project");
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!p) throw new UserError("Unknown project");
    if (!p.budgetInitializedAt) throw new UserError("The cost budget opens once the quotation is approved.");

    const items = await db.select().from(quotationItems).where(eq(quotationItems.projectId, projectId));
    const fieldErrors: Record<string, string> = {};
    const updates: { id: string; plannedCost: string | null; costNotes: string | null }[] = [];

    for (const it of items) {
      const rawPlanned = fd.get(`planned_${it.id}`);
      const rawNotes = fd.get(`notes_${it.id}`);
      if (rawPlanned === null && rawNotes === null) continue; // not on the form
      let plannedCost: string | null = it.plannedCost;
      if (typeof rawPlanned === "string") {
        if (rawPlanned.trim() === "") plannedCost = null;
        else {
          const m = parseMoneyInput(rawPlanned);
          if (m === null) {
            fieldErrors[`planned_${it.id}`] = `${it.itemCode}: invalid amount`;
            continue;
          }
          plannedCost = m;
        }
      }
      const costNotes = typeof rawNotes === "string" ? rawNotes.trim().slice(0, 1000) || null : it.costNotes;
      if (plannedCost !== it.plannedCost || costNotes !== it.costNotes) {
        updates.push({ id: it.id, plannedCost, costNotes });
      }
    }
    if (Object.keys(fieldErrors).length) {
      return { error: Object.values(fieldErrors).join(" · "), fieldErrors };
    }
    if (!updates.length) return { ok: true, message: "No changes to save" };

    const [first, ...rest] = updates.map((u) =>
      db.update(quotationItems).set({ plannedCost: u.plannedCost, costNotes: u.costNotes }).where(eq(quotationItems.id, u.id)),
    );
    await db.batch([first, ...rest]);
    revalidateProject(projectId);
    return { ok: true, message: `Saved ${updates.length} budget line(s)` };
  });
}
