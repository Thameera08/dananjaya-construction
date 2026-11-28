"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { inventoryItems, projects, stockMovements } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { D, formatQty } from "@/lib/money";
import { isUuid, maxSeq, seqCode } from "@/lib/utils";
import { fromZod, isoDate, optionalMoney, optionalText, quantityField, requiredText, type ActionState } from "@/lib/validation";
import { run, uniqueConstraint, UserError, withCodeRetry } from "./_run";

function revalidateInventory(projectId?: string | null) {
  revalidatePath("/inventory");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

const optionalQty = z
  .string()
  .optional()
  .transform((v) => (v ? v.replace(/,/g, "").trim() : null))
  .refine((v) => v === null || /^\d{1,11}(\.\d{1,3})?$/.test(v), "Reorder level must be a number");

const itemSchema = z.object({
  name: requiredText("Item name", 150),
  category: z.string().trim().max(80).optional().transform((v) => v || "General"),
  unit: requiredText("Unit", 30),
  reorderLevel: optionalQty,
  notes: optionalText(500),
});

export async function createInventoryItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageInventory");
    const parsed = itemSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    try {
      const code = await withCodeRetry(async () => {
        const rows = await db.select({ c: inventoryItems.itemCode }).from(inventoryItems);
        const itemCode = seqCode("IN", maxSeq(rows.map((r) => r.c)) + 1);
        await db.insert(inventoryItems).values({ itemCode, ...d });
        return itemCode;
      });
      revalidateInventory();
      return { ok: true, message: `${code} · ${d.name} added` };
    } catch (e) {
      if (uniqueConstraint(e) === "inventory_items_name_uq") throw new UserError(`"${d.name}" is already in the inventory.`);
      throw e;
    }
  });
}

export async function updateInventoryItem(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageInventory");
    if (!isUuid(itemId)) throw new UserError("Unknown item");
    const parsed = itemSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    try {
      const [it] = await db.update(inventoryItems).set(parsed.data).where(eq(inventoryItems.id, itemId)).returning();
      if (!it) throw new UserError("Unknown item");
      revalidateInventory();
      return { ok: true, message: `${it.itemCode} updated` };
    } catch (e) {
      if (uniqueConstraint(e) === "inventory_items_name_uq") throw new UserError(`Another item is already named "${parsed.data.name}".`);
      throw e;
    }
  });
}

export async function deleteInventoryItem(itemId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(itemId)) throw new UserError("Unknown item");
    const [it] = await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId)).returning();
    if (!it) throw new UserError("Unknown item");
    revalidateInventory();
    return { ok: true, message: `${it.itemCode} and its stock history deleted` };
  });
}

const movementSchema = z.object({
  itemId: z.string().refine(isUuid, "Choose an item"),
  movementType: z.enum(["IN", "OUT", "ADJUST"]),
  movementDate: isoDate("Date"),
  quantity: quantityField,
  /** ADJUST only: add to or remove from stock. */
  direction: z.enum(["ADD", "REMOVE"]).optional(),
  unitCost: optionalMoney("Unit cost"),
  projectId: z.string().optional(),
  reference: optionalText(100),
  notes: optionalText(500),
});

/**
 * Record a stock movement. Anything that reduces stock is inserted by one SQL statement that
 * only succeeds while on-hand stays ≥ 0, so two people issuing at once can't overdraw it.
 */
export async function recordStockMovement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authorize("manageInventory");
    const parsed = movementSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    if (D(d.quantity).lessThanOrEqualTo(0)) throw new UserError("Quantity must be greater than zero.");

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, d.itemId));
    if (!item) throw new UserError("Unknown item");

    let projectId: string | null = null;
    if (isUuid(d.projectId)) {
      const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, d.projectId));
      if (!p) throw new UserError("Unknown project");
      projectId = p.id;
    }
    if (d.movementType === "OUT" && !projectId) throw new UserError("Choose the project the material is issued to.");

    const negative = d.movementType === "OUT" || (d.movementType === "ADJUST" && d.direction === "REMOVE");
    const delta = negative ? `-${d.quantity}` : d.quantity;
    const unitCost = d.movementType === "IN" ? d.unitCost : null;

    const res = await db.execute(sql`
      INSERT INTO ${stockMovements} (item_id, movement_date, movement_type, quantity, unit_cost, project_id, reference, notes, created_by)
      SELECT ${item.id}::uuid, ${d.movementDate}::date, ${d.movementType}::stock_movement_type, ${delta}::numeric,
             ${unitCost}::numeric, ${projectId}::uuid, ${d.reference}, ${d.notes}, ${user.id}::uuid
       WHERE (SELECT COALESCE(SUM(quantity), 0) FROM ${stockMovements} WHERE item_id = ${item.id}::uuid) + ${delta}::numeric >= 0
      RETURNING id
    `);
    if (!res.rows.length) {
      const [{ onHand }] = await db
        .select({ onHand: sql<string>`COALESCE(SUM(${stockMovements.quantity}), 0)` })
        .from(stockMovements)
        .where(eq(stockMovements.itemId, item.id));
      throw new UserError(`Not enough stock: only ${formatQty(onHand)} ${item.unit} of ${item.name} on hand.`);
    }
    revalidateInventory(projectId);
    const verb = d.movementType === "IN" ? "received" : d.movementType === "OUT" ? "issued" : negative ? "removed" : "added";
    return { ok: true, message: `${formatQty(d.quantity)} ${item.unit} of ${item.name} ${verb}` };
  });
}

export async function deleteStockMovement(movementId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("deleteFinancialRecords");
    if (!isUuid(movementId)) throw new UserError("Unknown movement");
    // Removing a stock-in must not leave the item below zero.
    const res = await db.execute(sql`
      DELETE FROM ${stockMovements} m
       WHERE m.id = ${movementId}::uuid
         AND (SELECT COALESCE(SUM(quantity), 0) FROM ${stockMovements} WHERE item_id = m.item_id) - m.quantity >= 0
      RETURNING m.project_id
    `);
    if (!res.rows.length) throw new UserError("Can't delete: the item would go below zero stock. Delete the later issues first.");
    revalidateInventory((res.rows[0] as { project_id: string | null }).project_id);
    return { ok: true, message: "Stock movement deleted" };
  });
}
