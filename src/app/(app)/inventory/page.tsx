import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Package, PackagePlus, Pencil, SlidersHorizontal, Trash2, Wallet } from "lucide-react";
import { createInventoryItem, deleteInventoryItem, deleteStockMovement, recordStockMovement, updateInventoryItem } from "@/actions/inventory";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { InventoryItem } from "@/db/schema";
import { INVENTORY_CATEGORIES, STOCK_MOVEMENT_LABELS, UNITS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { stockRows } from "@/lib/inventory";
import { D, formatQty, sum } from "@/lib/money";
import { getInventory, listProjectsBrief } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { formatDate, todayLK } from "@/lib/utils";

export const metadata = { title: "Inventory" };

type SP = Promise<{ q?: string; category?: string; low?: string }>;

export default function InventoryPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader title="Inventory" description="Materials and tools in the store: stock in from suppliers, issue to project sites." />
      <Suspense fallback={<PageSkeleton />}>
        <InventoryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const UNIT_OPTIONS = [...UNITS, "kg", "L", "bags", "boxes", "rolls", "sheets", "tins"];

function ItemFields({ it, categories }: { it?: InventoryItem; categories: string[] }) {
  const listId = `inv-cat-${it?.id ?? "new"}`;
  const unitList = `inv-unit-${it?.id ?? "new"}`;
  return (
    <>
      <Field label="Item name" className="sm:col-span-2">
        <Input name="name" defaultValue={it?.name} required placeholder="e.g. Emulsion paint (white) 4L" />
      </Field>
      <Field label="Category">
        <Input name="category" list={listId} defaultValue={it?.category ?? ""} placeholder="General" autoComplete="off" />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Unit">
        <Input name="unit" list={unitList} defaultValue={it?.unit} required placeholder="pcs, tins, kg…" autoComplete="off" />
        <datalist id={unitList}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </Field>
      <Field label="Reorder level" hint="Warn when stock falls to this">
        <Input name="reorderLevel" inputMode="decimal" defaultValue={it?.reorderLevel ?? ""} />
      </Field>
      <Field label="Notes">
        <Input name="notes" defaultValue={it?.notes ?? ""} />
      </Field>
    </>
  );
}

async function InventoryContent({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ items, movements }, projects] = await Promise.all([getInventory(), listProjectsBrief()]);
  const today = todayLK();
  const canEdit = can(user.role, "manageInventory");
  const canDelete = can(user.role, "deleteFinancialRecords");

  const all = stockRows(items, movements);
  const categories = [...new Set([...INVENTORY_CATEGORIES, ...items.map((i) => i.category)])].sort();
  const q = sp.q?.trim().toLowerCase() ?? "";
  const rows = all.filter(
    (r) =>
      (!q || r.item.name.toLowerCase().includes(q) || r.item.itemCode.toLowerCase().includes(q)) &&
      (!sp.category || r.item.category === sp.category) &&
      (!sp.low || r.low),
  );
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const lowCount = all.filter((r) => r.low).length;
  const stockValue = sum(all, (r) => r.value);
  const monthStart = today.slice(0, 8) + "01";
  const issuedThisMonth = movements.filter((m) => m.movementType === "OUT" && m.movementDate >= monthStart).length;
  const recent = movements.slice(0, 60);
  const filtered = !!(q || sp.category || sp.low);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Items in store" value={items.length} sub={`${categories.length} categories`} icon={<Boxes />} tone="info" />
        <KpiCard label="Stock value" value={<Money value={stockValue} />} sub="At weighted-average purchase cost" icon={<Wallet />} tone="good" />
        <KpiCard label="Low stock" value={lowCount} sub={lowCount ? "At or below reorder level" : "All above reorder level"} icon={<AlertTriangle />} tone={lowCount ? "bad" : "good"} />
        <KpiCard label="Issues this month" value={issuedThisMonth} sub="Materials sent to sites" icon={<ArrowUpFromLine />} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Stock on hand</CardTitle>
            <CardDescription>On hand = stock in − issued ± adjustments. Value uses the average purchase price.</CardDescription>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Drawer trigger={<><ArrowDownToLine /> Stock in / issue</>} title="Record stock movement" description="Stock in from a supplier, issue to a project site, or correct a count.">
                <MovementForm items={items} projects={projects} today={today} />
              </Drawer>
              <Drawer trigger={<><PackagePlus /> New item</>} triggerVariant="accent" title="Add inventory item" description="Item codes (IN-xxx) are assigned automatically.">
                <ActionForm action={createInventoryItem} className="grid gap-4 sm:grid-cols-2">
                  <ItemFields categories={categories} />
                  <SubmitButton variant="accent" className="sm:col-span-2">Add item</SubmitButton>
                </ActionForm>
              </Drawer>
            </div>
          )}
        </CardHeader>

        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-3">
          <Field label="Search">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name or code" className="w-52" />
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={sp.category ?? ""} className="w-44">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={!!sp.low} className="size-4 accent-[var(--color-accent)]" /> Low stock only
          </label>
          <button className={buttonVariants({ variant: "outline", size: "sm" })}><SlidersHorizontal /> Apply</button>
          {filtered && <Link href="/inventory" className={buttonVariants({ variant: "ghost", size: "sm" })}>Clear</Link>}
        </form>

        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title={items.length ? "No items match the filter" : "No inventory items yet"} icon={<Package />}>
              {items.length ? "Try a different search or category." : "Add the materials and tools you keep in the store, then record stock in."}
            </EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH className="text-right">Received</TH>
                <TH className="text-right">Issued</TH>
                <TH className="text-right">On hand</TH>
                <TH className="text-right">Avg cost</TH>
                <TH className="text-right">Value</TH>
                {(canEdit || canDelete) && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.item.id}>
                  <TD>
                    <p className="font-medium">{r.item.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.item.itemCode}</p>
                  </TD>
                  <TD className="text-xs">{r.item.category}</TD>
                  <TD className="num">{formatQty(r.totalIn)}</TD>
                  <TD className="num">{formatQty(r.totalOut)}</TD>
                  <TD className="num font-semibold">
                    {formatQty(r.onHand)} <span className="text-xs font-normal text-muted-foreground">{r.item.unit}</span>
                    {r.low && <Badge tone="danger" className="ml-1.5">Low</Badge>}
                  </TD>
                  <TD className="num">{r.avgCost ? <Money value={r.avgCost} prefix={false} /> : "—"}</TD>
                  <TD className="num"><Money value={r.value} prefix={false} /></TD>
                  {(canEdit || canDelete) && (
                    <TD>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Drawer trigger={<><ArrowUpFromLine className="size-3.5" /> Move</>} triggerVariant="ghost" triggerSize="xs" title={`Stock movement · ${r.item.name}`} description={`On hand: ${formatQty(r.onHand)} ${r.item.unit}`}>
                            <MovementForm items={items} projects={projects} today={today} itemId={r.item.id} />
                          </Drawer>
                        )}
                        {canEdit && (
                          <Drawer trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="xs" triggerLabel={`Edit ${r.item.itemCode}`} title={`Edit ${r.item.itemCode}`}>
                            <ActionForm action={updateInventoryItem.bind(null, r.item.id)} className="grid gap-4 sm:grid-cols-2" keepValues>
                              <ItemFields it={r.item} categories={categories} />
                              <SubmitButton size="sm" className="sm:col-span-2">Save</SubmitButton>
                            </ActionForm>
                          </Drawer>
                        )}
                        {canDelete && (
                          <ActionForm action={deleteInventoryItem.bind(null, r.item.id)} compact confirm={`Delete ${r.item.name} and all its stock history?`}>
                            <SubmitButton size="icon" variant="danger-ghost" aria-label={`Delete ${r.item.itemCode}`}><Trash2 /></SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent stock movements</CardTitle>
            <CardDescription>Latest {recent.length} of {movements.length} movements</CardDescription>
          </div>
        </CardHeader>
        {recent.length === 0 ? (
          <CardContent>
            <EmptyState title="No movements yet">Use &ldquo;Stock in / issue&rdquo; when materials arrive or go to a site.</EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Item</TH>
                <TH>Type</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit cost</TH>
                <TH>Project</TH>
                <TH>Ref / notes</TH>
                {canDelete && <TH />}
              </TR>
            </THead>
            <TBody>
              {recent.map((m) => {
                const it = itemsById.get(m.itemId);
                const p = m.projectId ? projectsById.get(m.projectId) : null;
                const qty = D(m.quantity);
                return (
                  <TR key={m.id}>
                    <TD className="text-xs whitespace-nowrap">{formatDate(m.movementDate)}</TD>
                    <TD className="text-sm">{it?.name ?? "—"}</TD>
                    <TD>
                      <Badge tone={m.movementType === "IN" ? "success" : m.movementType === "OUT" ? "warning" : "neutral"}>{STOCK_MOVEMENT_LABELS[m.movementType]}</Badge>
                    </TD>
                    <TD className={`num font-medium ${qty.isNegative() ? "text-danger" : "text-success"}`}>
                      {qty.isNegative() ? "−" : "+"}{formatQty(qty.abs())} <span className="text-xs font-normal text-muted-foreground">{it?.unit}</span>
                    </TD>
                    <TD className="num">{m.unitCost ? <Money value={m.unitCost} prefix={false} /> : "—"}</TD>
                    <TD className="text-xs">{p ? <Link href={`/projects/${p.id}/analysis`} className="hover:underline">{p.title}</Link> : "—"}</TD>
                    <TD className="max-w-64 text-xs text-muted-foreground">{[m.reference, m.notes].filter(Boolean).join(" · ")}</TD>
                    {canDelete && (
                      <TD>
                        <ActionForm action={deleteStockMovement.bind(null, m.id)} compact confirm="Delete this stock movement?">
                          <SubmitButton size="icon" variant="danger-ghost" aria-label="Delete movement"><Trash2 /></SubmitButton>
                        </ActionForm>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MovementForm({
  items,
  projects,
  today,
  itemId,
}: {
  items: InventoryItem[];
  projects: { id: string; title: string; quotationNumber: string }[];
  today: string;
  itemId?: string;
}) {
  return (
    <ActionForm action={recordStockMovement} className="grid gap-4 sm:grid-cols-2">
      <Field label="Item" className="sm:col-span-2">
        <Select name="itemId" defaultValue={itemId ?? ""} required>
          <option value="" disabled>Choose an item…</option>
          {items.filter((i) => i.isActive || i.id === itemId).map((i) => (
            <option key={i.id} value={i.id}>{i.itemCode} · {i.name} ({i.unit})</option>
          ))}
        </Select>
      </Field>
      <Field label="Movement">
        <Select name="movementType" defaultValue="IN">
          <option value="IN">Stock in (purchase / return)</option>
          <option value="OUT">Issue to project site</option>
          <option value="ADJUST">Adjustment (count correction)</option>
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" name="movementDate" defaultValue={today} required />
      </Field>
      <Field label="Quantity">
        <Input name="quantity" inputMode="decimal" required />
      </Field>
      <Field label="Unit cost (Rs.)" hint="Stock in only">
        <Input name="unitCost" inputMode="decimal" placeholder="Optional" />
      </Field>
      <Field label="Project" className="sm:col-span-2" hint="Required when issuing to site">
        <Select name="projectId" defaultValue="">
          <option value="">— Store / no project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.quotationNumber} · {p.title}</option>
          ))}
        </Select>
      </Field>
      <Field label="Adjustment direction" hint="Adjustments only">
        <Select name="direction" defaultValue="REMOVE">
          <option value="REMOVE">Remove (damaged / lost)</option>
          <option value="ADD">Add (found / recount)</option>
        </Select>
      </Field>
      <Field label="Reference">
        <Input name="reference" placeholder="GRN / bill no." />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Input name="notes" />
      </Field>
      <SubmitButton variant="accent" className="sm:col-span-2">Record movement</SubmitButton>
    </ActionForm>
  );
}
