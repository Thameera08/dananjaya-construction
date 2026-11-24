import { Suspense } from "react";
import { Banknote, History, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
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
import { AttachButton, FileUploadField } from "@/components/file-upload";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { costTypeEnum, paymentMethodEnum, type Expense, type QuotationItem } from "@/db/schema";
import { COST_TYPE_LABELS, OVERHEAD_CATEGORIES, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { bySort, projectSummary } from "@/lib/finance";
import { D } from "@/lib/money";
import { getExpensePayments, requireProjectData } from "@/lib/queries";
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

function AllocationFields({ items, categories, e }: { items: QuotationItem[]; categories: string[]; e?: Expense }) {
  return (
    <>
      <Field label="BOQ item" className="md:col-span-2" hint="Linked items take their item's work category">
        <Select name="quotationItemId" defaultValue={e?.quotationItemId ?? "UNALLOCATED"}>
          <option value="UNALLOCATED">UNALLOCATED · site overheads / general</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} · {i.workCategory} · {i.description.slice(0, 50)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Work category (if unallocated)">
        <Select name="workCategory" defaultValue={e?.workCategory ?? OVERHEAD_CATEGORIES[0]}>
          <optgroup label="Site overheads">
            {OVERHEAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </optgroup>
          <optgroup label="BOQ sections">
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Cost type">
        <Select name="costType" defaultValue={e?.costType ?? "SUPPLIER"}>
          {costTypeEnum.enumValues.map((t) => (
            <option key={t} value={t}>{COST_TYPE_LABELS[t]}</option>
          ))}
        </Select>
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
  const canEdit = can(user.role, "manageExpenses");
  const canDelete = can(user.role, "deleteFinancialRecords");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total incurred costs" value={<Money value={s.cash.totalIncurred} />} sub={`${data.expenses.length} entries`} />
        <KpiCard label="Paid to date" value={<Money value={s.cash.totalPaidCosts} />} />
        <KpiCard label="Unpaid balance (A/P)" value={<Money value={s.cash.accountsPayable} />} tone={s.cash.accountsPayable.isZero() ? "good" : "warn"} />
        <KpiCard label="Overdue to vendors" value={<Money value={s.cash.overduePayables} />} sub={`${s.cash.overdueCount} bill(s) past due date`} tone={s.cash.overdueCount ? "bad" : "default"} />
      </div>

      <Callout tone="info" title="One bill, one entry">
        Record the <strong>full bill amount</strong> once as Total Incurred Cost, then log each part-payment against that same Cost ID with
        &ldquo;Pay&rdquo;. Duplicate bill references are rejected, and payments can never exceed the bill.
      </Callout>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Expense ledger</CardTitle>
            <CardDescription>Supplier invoices, labour and site expenses (EX-xxx)</CardDescription>
          </div>
        </CardHeader>
        {data.expenses.length === 0 ? (
          <CardContent>
            <EmptyState title="No expenses recorded" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cost ID</TH>
                <TH>Date</TH>
                <TH>Category / item</TH>
                <TH>Vendor / details</TH>
                <TH>Bill ref</TH>
                <TH>Due</TH>
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
                    <TD className="font-mono text-xs font-medium">{e.costCode}</TD>
                    <TD className="text-xs whitespace-nowrap">{formatDate(e.expenseDate)}</TD>
                    <TD className="text-xs">
                      <p>{e.workCategory}</p>
                      <p className="text-muted-foreground">{item ? item.itemCode : "UNALLOCATED"} · {COST_TYPE_LABELS[e.costType]}</p>
                    </TD>
                    <TD className="min-w-44 max-w-64">
                      <p className="text-sm">{e.vendorDetails}</p>
                      {e.comments && <p className="text-xs text-muted-foreground">{e.comments}</p>}
                    </TD>
                    <TD className="text-xs whitespace-nowrap">{e.invoiceRef}</TD>
                    <TD className="text-xs whitespace-nowrap">
                      {formatDate(e.dueDate)} {overdue && <Badge tone="danger">Overdue</Badge>}
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
                          <Popover label={<><Banknote className="size-3.5" /> Pay</>}>
                            <p className="mb-2 text-xs text-muted-foreground">
                              Unpaid on {e.costCode}: <Money value={unpaid} />
                            </p>
                            <ActionForm action={recordExpensePayment.bind(null, e.id)} className="grid gap-2">
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
                          <Popover label={<><History className="size-3.5" /> {hist.length}</>} wide>
                            <p className="mb-2 text-xs font-semibold">Disbursements · {e.costCode}</p>
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
                          <Popover label={<Pencil className="size-3.5" />} wide>
                            <ActionForm action={updateExpense.bind(null, e.id)} className="grid gap-3 md:grid-cols-2" keepValues>
                              <Field label="Date">
                                <Input type="date" name="expenseDate" defaultValue={e.expenseDate} required />
                              </Field>
                              <AllocationFields items={allItems} categories={categories} e={e} />
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
                              <SubmitButton size="sm" className="md:col-span-2">Save {e.costCode}</SubmitButton>
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
                <TD colSpan={6}>Totals</TD>
                <TD className="num"><Money value={s.cash.totalIncurred} prefix={false} /></TD>
                <TD className="num"><Money value={s.cash.totalPaidCosts} prefix={false} /></TD>
                <TD className="num"><Money value={s.cash.accountsPayable} prefix={false} /></TD>
                <TD />
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="size-4" /> Record expense / bill</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createExpense.bind(null, id)} className="grid gap-4 md:grid-cols-4">
              <Field label="Date">
                <Input type="date" name="expenseDate" defaultValue={today} required />
              </Field>
              <AllocationFields items={items} categories={categories} />
              <Field label="Vendor / details" className="md:col-span-2">
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
              <Field label="Supplier bill (photo / PDF)">
                <FileUploadField name="receiptBlobUrl" kind="bills" label="Upload bill" />
              </Field>
              <Field label="Comments" className="md:col-span-3">
                <Input name="comments" />
              </Field>
              <div className="flex items-end">
                <SubmitButton variant="accent" className="w-full">Record expense</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Popover({ label, children, wide }: { label: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <details className="relative">
      <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs hover:bg-muted">{label}</summary>
      <div className={`absolute right-0 z-20 mt-1 rounded-md border border-border bg-card p-3 text-left shadow-lg ${wide ? "w-[min(34rem,90vw)]" : "w-72"}`}>
        {children}
      </div>
    </details>
  );
}
