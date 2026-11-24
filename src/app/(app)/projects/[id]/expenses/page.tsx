import { Suspense } from "react";
import { AlertTriangle, Banknote, History, Pencil, Plus, Trash2, Truck, Undo2, Wallet } from "lucide-react";
import {
  attachExpenseBill,
  createExpense,
  deleteExpense,
  recordExpensePayment,
  reverseExpensePayment,
  updateExpense,
} from "@/actions/expenses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AttachmentLink } from "@/components/attachment-link";
import { CostTypeField } from "@/components/cost-type-field";
import { AttachButton, FileUploadField } from "@/components/file-upload";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { paymentMethodEnum, type CostType, type Expense, type QuotationItem } from "@/db/schema";
import { COST_TYPE_LABELS, OVERHEAD_CATEGORIES, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { bySort, projectSummary } from "@/lib/finance";
import { D } from "@/lib/money";
import { getExpenseLists, getExpensePayments, requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { formatDate, todayLK } from "@/lib/utils";

export const metadata = { title: "Expense Ledger" };

export default function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExpensesContent params={params} />
    </Suspense>
  );
}

type Lists = { types: { name: string; baseType: CostType }[]; categoryOptions: string[] };

function AllocationFields({ items, lists, e }: { items: QuotationItem[]; lists: Lists; e?: Expense }) {
  const listId = `cat-${e?.id ?? "new"}`;
  return (
    <>
      <Field label="BOQ item" className="sm:col-span-2" hint="Linked items take their item's work category">
        <Select name="quotationItemId" defaultValue={e?.quotationItemId ?? "UNALLOCATED"}>
          <option value="UNALLOCATED">UNALLOCATED · site overheads / personal / company assets</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} · {i.workCategory} · {i.description.slice(0, 50)}
            </option>
          ))}
        </Select>
      </Field>
      <CostTypeField
        types={lists.types}
        defaultName={e ? (e.costLabel ?? COST_TYPE_LABELS[e.costType]) : undefined}
        defaultBase={e?.costType}
      />
      <Field label="Work category (if unallocated)" className="sm:col-span-2" hint="Pick one, or type a new category: it will be saved for next time">
        <Input name="workCategory" list={listId} defaultValue={e?.quotationItemId ? "" : (e?.workCategory ?? "")} placeholder="e.g. Food, Transport, Hardware Items" autoComplete="off" />
        <datalist id={listId}>
          {lists.categoryOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
    </>
  );
}

async function ExpensesContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const today = todayLK();
  const s = projectSummary(data, today);
  const payments = await getExpensePayments(data.expenses.map((e) => e.id));
  const items = data.items.filter((i) => i.isActive).sort(bySort);
  const allItems = [...data.items].sort(bySort); // edit form must still show a deactivated linked item
  const itemsById = new Map(data.items.map((i) => [i.id, i]));
  const categories = [...new Set(items.map((i) => i.workCategory))];
  const expenseLists = await getExpenseLists();
  const lists: Lists = {
    types: expenseLists.types,
    categoryOptions: [...new Set([...OVERHEAD_CATEGORIES, ...expenseLists.categories, ...categories])],
  };
  const canEdit = can(user.role, "manageExpenses");
  const canDelete = can(user.role, "deleteFinancialRecords");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total incurred costs" value={<Money value={s.cash.totalIncurred} />} sub={`${data.expenses.length} entries`} icon={<Wallet />} tone="info" />
        <KpiCard
          label="Paid to date"
          value={<Money value={s.cash.totalPaidCosts} />}
          icon={<Banknote />}
          tone="good"
          progress={s.cash.totalIncurred.isZero() ? undefined : s.cash.totalPaidCosts.dividedBy(s.cash.totalIncurred).times(100).toNumber()}
        />
        <KpiCard label="Unpaid balance (A/P)" value={<Money value={s.cash.accountsPayable} />} tone={s.cash.accountsPayable.isZero() ? "good" : "warn"} icon={<Truck />} />
        <KpiCard label="Overdue to vendors" value={<Money value={s.cash.overduePayables} />} sub={`${s.cash.overdueCount} bill(s) past due date`} tone={s.cash.overdueCount ? "bad" : "default"} icon={<AlertTriangle />} />
      </div>

      <Callout tone="info" title="One bill, one entry">
        Record the <strong>full bill amount</strong> once as Total Incurred Cost, then log each part-payment against that same Cost ID with
        &ldquo;Pay&rdquo;. Duplicate bill references are rejected, and payments can never exceed the bill. Use cost type{" "}
        <strong>Personal</strong> for personal use of project money and <strong>Company asset</strong> for tools / hardware the company
        keeps: both are deducted from project profit. Wage advances go under <strong>Labour Loans</strong>, not here.
      </Callout>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Expense ledger</CardTitle>
            <CardDescription>Supplier invoices, labour and site expenses (EX-xxx)</CardDescription>
          </div>
          {canEdit && (
            <Drawer trigger={<><Plus /> Record expense</>} triggerVariant="accent" title="Record expense / bill" description="Enter the full bill amount once; log part-payments later with Pay.">
            <ActionForm action={createExpense.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <Input type="date" name="expenseDate" defaultValue={today} required />
              </Field>
              <AllocationFields items={items} lists={lists} />
              <Field label="Vendor / details" className="sm:col-span-2">
                <Input name="vendorDetails" required placeholder="e.g. Lanka Electricals: LED panels" />
              </Field>
              <Field label="Invoice / bill ref">
                <Input name="invoiceRef" />
              </Field>
              <Field label="Due date">
                <Input type="date" name="dueDate" />
              </Field>
              <Field label="Total incurred cost (Rs.)" hint="Full bill amount">
                <Input name="totalCost" inputMode="decimal" required />
              </Field>
              <Field label="Paid now (Rs.)" hint="Optional; 0 if on credit">
                <Input name="initialPaid" inputMode="decimal" placeholder="0.00" />
              </Field>
              <Field label="Paid via">
                <Select name="paymentMethod" defaultValue="CASH">
                  {paymentMethodEnum.enumValues.map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Supplier bill (photo / PDF)" className="sm:col-span-2">
                <FileUploadField name="receiptBlobUrl" kind="bills" label="Upload bill" />
              </Field>
              <Field label="Comments" className="sm:col-span-2">
                <Input name="comments" />
              </Field>
              <SubmitButton variant="accent" className="sm:col-span-2">Record expense</SubmitButton>
            </ActionForm>
            </Drawer>
          )}
        </CardHeader>
        {data.expenses.length === 0 ? (
          <CardContent>
            <EmptyState title="No expenses recorded">Use &ldquo;Record expense&rdquo; for each supplier bill, wage payment or site cost.</EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cost ID / date</TH>
                <TH>Category / item</TH>
                <TH>Vendor / bill</TH>
                <TH className="text-right">Total incurred</TH>
                <TH className="text-right">Paid to date</TH>
                <TH className="text-right">Unpaid</TH>
                <TH className="text-right">Bill / actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.expenses.map((e) => {
                const unpaid = D(e.totalCost).minus(D(e.paidToDate));
                const overdue = unpaid.greaterThan(0) && e.dueDate && e.dueDate < today;
                const item = e.quotationItemId ? itemsById.get(e.quotationItemId) : null;
                const hist = payments.filter((p) => p.expenseId === e.id);
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold">{e.costCode}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(e.expenseDate)}</p>
                    </TD>
                    <TD className="text-xs">
                      <p>{e.workCategory}</p>
                      <p className="text-muted-foreground">{item ? item.itemCode : "UNALLOCATED"} · {e.costLabel ?? COST_TYPE_LABELS[e.costType]}</p>
                      {e.costType === "PERSONAL" && <Badge tone="danger" className="mt-1">Personal: off profit</Badge>}
                      {e.costType === "ASSET" && <Badge tone="info" className="mt-1">Company asset: off profit</Badge>}
                    </TD>
                    <TD className="min-w-52 max-w-72">
                      <p className="text-sm">{e.vendorDetails}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {e.invoiceRef && <span>Ref {e.invoiceRef}</span>}
                        {e.dueDate && <span>Due {formatDate(e.dueDate)}</span>}
                        {overdue && <Badge tone="danger">Overdue</Badge>}
                      </p>
                      {e.comments && <p className="mt-0.5 text-xs text-muted-foreground italic">{e.comments}</p>}
                    </TD>
                    <TD className="num"><Money value={e.totalCost} prefix={false} /></TD>
                    <TD className="num"><Money value={e.paidToDate} prefix={false} /></TD>
                    <TD className="num font-medium">
                      {unpaid.isZero() ? <Badge tone="success">Paid</Badge> : <Money value={unpaid} prefix={false} />}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {e.receiptBlobUrl ? (
                          <AttachmentLink url={e.receiptBlobUrl} label="Bill" />
                        ) : canEdit ? (
                          <AttachButton kind="bills" iconOnly onAttach={attachExpenseBill.bind(null, e.id)} />
                        ) : null}
                        {canEdit && unpaid.greaterThan(0) && (
                          <Popover label={<><Banknote className="size-3.5" /> Pay</>} title={`Pay against ${e.costCode}`} description={e.vendorDetails} tooltip={`Record a payment against ${e.costCode}`}>
                            <p className="mb-2 text-xs text-muted-foreground">
                              Unpaid on {e.costCode}: <Money value={unpaid} />
                            </p>
                            <ActionForm action={recordExpensePayment.bind(null, e.id)} className="grid gap-4">
                              <Field label="Amount (Rs.)">
                                <Input name="amount" inputMode="decimal" defaultValue={unpaid.toFixed(2)} required />
                              </Field>
                              <div className="grid grid-cols-2 gap-2">
                                <Field label="Date">
                                  <Input type="date" name="paymentDate" defaultValue={today} required />
                                </Field>
                                <Field label="Method">
                                  <Select name="paymentMethod" defaultValue="CASH">
                                    {paymentMethodEnum.enumValues.map((m) => (
                                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                              <Field label="Reference">
                                <Input name="referenceNo" />
                              </Field>
                              <SubmitButton size="sm" variant="accent">Record payment</SubmitButton>
                            </ActionForm>
                          </Popover>
                        )}
                        {hist.length > 0 && (
                          <Popover label={<><History className="size-3.5" /> {hist.length}</>} title={`Disbursements · ${e.costCode}`} description={e.vendorDetails} tooltip="Payment history">
                            <ul className="divide-y divide-border text-xs">
                              {hist.map((p) => (
                                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                                  <span>
                                    {formatDate(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.paymentMethod]}
                                    {p.referenceNo ? ` · ${p.referenceNo}` : ""}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Money value={p.amount} />
                                    {canDelete && (
                                      <ActionForm action={reverseExpensePayment.bind(null, p.id)} compact confirm="Reverse this disbursement?">
                                        <SubmitButton size="icon" variant="danger-ghost" className="size-6" aria-label="Reverse"><Undo2 /></SubmitButton>
                                      </ActionForm>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </Popover>
                        )}
                        {canEdit && (
                          <Popover label={<Pencil className="size-3.5" />} title={`Edit ${e.costCode}`} description="Payments are logged separately with Pay; the total can't go below what's already paid." tooltip={`Edit ${e.costCode}`}>
                            <ActionForm action={updateExpense.bind(null, e.id)} className="grid gap-4 sm:grid-cols-2" keepValues>
                              <Field label="Date">
                                <Input type="date" name="expenseDate" defaultValue={e.expenseDate} required />
                              </Field>
                              <AllocationFields items={allItems} lists={lists} e={e} />
                              <Field label="Vendor / details" className="md:col-span-2">
                                <Input name="vendorDetails" defaultValue={e.vendorDetails} required />
                              </Field>
                              <Field label="Bill ref">
                                <Input name="invoiceRef" defaultValue={e.invoiceRef ?? ""} />
                              </Field>
                              <Field label="Due date">
                                <Input type="date" name="dueDate" defaultValue={e.dueDate ?? ""} />
                              </Field>
                              <Field label="Total incurred cost (Rs.)" hint={`Can't go below paid (${e.paidToDate})`}>
                                <Input name="totalCost" inputMode="decimal" defaultValue={e.totalCost} required />
                              </Field>
                              <Field label="Comments">
                                <Input name="comments" defaultValue={e.comments ?? ""} />
                              </Field>
                              <SubmitButton size="sm" className="sm:col-span-2">Save {e.costCode}</SubmitButton>
                            </ActionForm>
                          </Popover>
                        )}
                        {canDelete && (
                          <ActionForm action={deleteExpense.bind(null, e.id)} compact confirm={`Delete ${e.costCode} and its payment history?`}>
                            <SubmitButton size="icon" variant="danger-ghost" aria-label={`Delete ${e.costCode}`}><Trash2 /></SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
              <TR className="bg-muted/60 font-semibold">
                <TD colSpan={3}>Totals</TD>
                <TD className="num"><Money value={s.cash.totalIncurred} prefix={false} /></TD>
                <TD className="num"><Money value={s.cash.totalPaidCosts} prefix={false} /></TD>
                <TD className="num"><Money value={s.cash.accountsPayable} prefix={false} /></TD>
                <TD />
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

    </div>
  );
}

/** Row action that opens a slide-over panel. */
function Popover({ label, title, description, children, tooltip }: { label: React.ReactNode; title: string; description?: React.ReactNode; children: React.ReactNode; tooltip?: string; wide?: boolean }) {
  return (
    <Drawer trigger={label} triggerVariant="ghost" triggerSize="xs" triggerLabel={tooltip} title={title} description={description}>
      {children}
    </Drawer>
  );
}
