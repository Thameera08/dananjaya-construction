import { Suspense } from "react";
import { CheckCircle2, Download, Pencil, Send, Trash2, Undo2, Plus, Lock } from "lucide-react";
import {
  addQuotationItem,
  reactivateQuotationItem,
  removeQuotationItem,
  setQuotationStatus,
  updateQuotationItem,
} from "@/actions/quotation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { QuotationItem } from "@/db/schema";
import { DEFAULT_WORK_CATEGORIES, UNITS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { contractTotals, groupByCategory } from "@/lib/finance";
import { formatQty } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";

export const metadata = { title: "Quotation" };

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QuotationContent params={params} />
    </Suspense>
  );
}

function Datalists({ categories }: { categories: string[] }) {
  return (
    <>
      <datalist id="work-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  );
}

function ItemFields({ item }: { item?: QuotationItem }) {
  return (
    <>
      <Field label="Work category" className="sm:col-span-2">
        <Input name="workCategory" list="work-categories" required defaultValue={item?.workCategory} placeholder="e.g. Painting Walls" />
      </Field>
      <Field label="Unit">
        <Input name="unit" list="units" required defaultValue={item?.unit} placeholder="sq. ft." />
      </Field>
      <Field label="Specification / description" className="sm:col-span-3">
        <Input name="description" required defaultValue={item?.description} />
      </Field>
      <Field label="Quantity">
        <Input name="quantity" inputMode="decimal" required defaultValue={item ? formatQty(item.quantity).replace(/,/g, "") : ""} />
      </Field>
      <Field label="Client unit rate (Rs.)">
        <Input name="clientRate" inputMode="decimal" required defaultValue={item?.clientRate} />
      </Field>
    </>
  );
}

async function QuotationContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { project, items } = await requireProjectData(id);
  const t = contractTotals(project, items);
  const groups = groupByCategory(items);
  const inactive = items.filter((i) => !i.isActive);
  const canEditRole = can(user.role, "editQuotation");
  const editable = canEditRole && project.status === "DRAFT";
  const categories = [...new Set([...groups.map((g) => g.category), ...DEFAULT_WORK_CATEGORIES])];
  const statusAction = setQuotationStatus.bind(null, id);

  return (
    <div className="space-y-6">
      {editable && <Datalists categories={categories} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Workflow:</span>
          {(["DRAFT", "SENT", "APPROVED"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span className={project.status === s ? "rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-white" : "text-xs text-muted-foreground"}>{s}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/projects/${id}/quotation-pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download /> Download PDF
          </a>
          {canEditRole && project.status === "DRAFT" && (
            <ActionForm action={statusAction} compact>
              <input type="hidden" name="status" value="SENT" />
              <SubmitButton size="sm"><Send /> Mark as sent</SubmitButton>
            </ActionForm>
          )}
          {canEditRole && project.status === "SENT" && (
            <>
              <ActionForm action={statusAction} compact>
                <input type="hidden" name="status" value="DRAFT" />
                <SubmitButton size="sm" variant="outline"><Undo2 /> Revise (back to draft)</SubmitButton>
              </ActionForm>
              {can(user.role, "approveQuotation") && (
                <ActionForm action={statusAction} compact confirm="Approve this quotation? BOQ items will be locked and the cost budget opened.">
                  <input type="hidden" name="status" value="APPROVED" />
                  <SubmitButton size="sm" variant="accent"><CheckCircle2 /> Approve</SubmitButton>
                </ActionForm>
              )}
            </>
          )}
          {project.status === "APPROVED" && can(user.role, "approveQuotation") && (
            <ActionForm action={statusAction} compact confirm="Re-open the approved quotation for revision? Totals on existing invoices will not change.">
              <input type="hidden" name="status" value="DRAFT" />
              <SubmitButton size="sm" variant="outline"><Undo2 /> Re-open for revision</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      {!editable && (
        <Callout tone="info">
          <span className="flex items-center gap-1.5">
            <Lock className="size-4" />
            {project.status === "DRAFT"
              ? "Your role can view the quotation but not edit it."
              : `The quotation is ${project.status}; BOQ items are locked.${canEditRole ? " Revert to DRAFT to revise." : ""}`}
          </span>
        </Callout>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Total label="Gross quoted value" value={<Money value={t.gross} />} />
        <Total label={`Discount (${t.discountPercent.toFixed(2)}%)`} value={<Money value={t.discountAmount.negated()} />} />
        <Total label="Net contract value" value={<Money value={t.net} />} strong />
        <Total label={`Advance (${t.advancePercent.toFixed(0)}%)`} value={<Money value={t.advanceRequired} />} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Bill of quantities</CardTitle>
            <CardDescription>{items.filter((i) => i.isActive).length} active line items in {groups.length} work categories</CardDescription>
          </div>
          {editable && (
            <Drawer
              trigger={<><Plus /> Add line item</>}
              triggerVariant="accent"
              title="Add BOQ line item"
              description={`The item ID (${project.projectCode}-001, -002…) and quoted value (quantity × rate) are calculated automatically.`}
            >
              <ActionForm action={addQuotationItem.bind(null, id)} className="grid gap-4 sm:grid-cols-3">
                <ItemFields />
                <SubmitButton variant="accent" className="sm:col-span-3">Add item</SubmitButton>
              </ActionForm>
            </Drawer>
          )}
        </CardHeader>
        {groups.length === 0 ? (
          <CardContent>
            <EmptyState title="No BOQ items yet">Use &ldquo;Add line item&rdquo; to start the bill of quantities.</EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Item ID</TH>
                <TH>Specification / description</TH>
                <TH>Unit</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Rate (Rs.)</TH>
                <TH className="text-right">Quoted value (Rs.)</TH>
                {editable && <TH className="w-24" />}
              </TR>
            </THead>
            <TBody>
              {groups.map((g) => (
                <GroupRows key={g.category} g={g} editable={editable} />
              ))}
              <TR className="bg-muted/60 font-semibold">
                <TD colSpan={5}>Gross quoted value</TD>
                <TD className="num"><Money value={t.gross} prefix={false} /></TD>
                {editable && <TD />}
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-sm">Deactivated items (excluded from totals)</CardTitle>
              <CardDescription>Kept because expenses are booked against them.</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <TBody>
              {inactive.map((it) => (
                <TR key={it.id} className="text-muted-foreground">
                  <TD className="w-24 font-mono text-xs">{it.itemCode}</TD>
                  <TD>{it.workCategory} · {it.description}</TD>
                  <TD className="num"><Money value={it.quotedValue} prefix={false} /></TD>
                  <TD className="w-28 text-right">
                    {editable && (
                      <ActionForm action={reactivateQuotationItem.bind(null, it.id)} compact>
                        <SubmitButton size="xs" variant="outline">Reactivate</SubmitButton>
                      </ActionForm>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

    </div>
  );
}

function GroupRows({ g, editable }: { g: ReturnType<typeof groupByCategory>[number]; editable: boolean }) {
  const cols = editable ? 7 : 6;
  return (
    <>
      <TR className="bg-muted/40">
        <TD colSpan={cols} className="font-semibold">{g.category}</TD>
      </TR>
      {g.rows.map((it) => (
        <TR key={it.id}>
          <TD className="font-mono text-xs">{it.itemCode}</TD>
          <TD>{it.description}</TD>
          <TD className="text-xs">{it.unit}</TD>
          <TD className="num">{formatQty(it.quantity)}</TD>
          <TD className="num"><Money value={it.clientRate} prefix={false} /></TD>
          <TD className="num font-medium"><Money value={it.quotedValue} prefix={false} /></TD>
          {editable && (
            <TD>
              <div className="flex justify-end gap-0.5">
                <Drawer trigger={<Pencil />} triggerVariant="ghost" triggerSize="icon" triggerLabel={`Edit ${it.itemCode}`} title={`Edit ${it.itemCode}`} description={it.workCategory}>
                  <ActionForm action={updateQuotationItem.bind(null, it.id)} className="grid gap-4 sm:grid-cols-3" keepValues>
                    <ItemFields item={it} />
                    <SubmitButton className="sm:col-span-3">Save {it.itemCode}</SubmitButton>
                  </ActionForm>
                </Drawer>
                <ActionForm action={removeQuotationItem.bind(null, it.id)} compact confirm={`Remove ${it.itemCode}?`}>
                  <SubmitButton size="icon" variant="danger-ghost" aria-label={`Remove ${it.itemCode}`} title={`Remove ${it.itemCode}`}><Trash2 /></SubmitButton>
                </ActionForm>
              </div>
            </TD>
          )}
        </TR>
      ))}
      <TR>
        <TD colSpan={5} className="text-right text-xs text-muted-foreground">Subtotal · {g.category}</TD>
        <TD className="num font-semibold"><Money value={g.subtotal} prefix={false} /></TD>
        {editable && <TD />}
      </TR>
    </>
  );
}

function Total({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-xs ${strong ? "border-primary bg-gradient-to-br from-primary to-[#2b3447] text-white" : "border-border bg-card"}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${strong ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
