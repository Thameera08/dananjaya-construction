import { Suspense } from "react";
import { Download, FilePlus2, FileText, HandCoins, Landmark, PiggyBank, Receipt, Scale, Send, Trash2 } from "lucide-react";
import { createInvoice, deleteInvoice, issueInvoice } from "@/actions/invoices";
import { attachPaymentSlip, createPayment, deletePayment } from "@/actions/payments";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AttachmentLink } from "@/components/attachment-link";
import { FileUploadField, AttachButton } from "@/components/file-upload";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { InvoiceStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { invoiceTypeEnum, paymentMethodEnum, paymentTypeEnum } from "@/db/schema";
import { INVOICE_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { invoicePaidAmount, projectSummary } from "@/lib/finance";
import { D, formatLKR, sum } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { formatDate, todayLK } from "@/lib/utils";

export const metadata = { title: "Invoices & Receipts" };

export default function InvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InvoicesContent params={params} />
    </Suspense>
  );
}

async function InvoicesContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const today = todayLK();
  const s = projectSummary(data, today);
  const invoiced = sum(data.invoices, (i) => i.amount);
  const canInvoice = can(user.role, "manageInvoices");
  const canReceipt = can(user.role, "manageReceipts");
  const canDelete = can(user.role, "deleteFinancialRecords");
  const invById = new Map(data.invoices.map((i) => [i.id, i]));
  const hasAdvance = data.invoices.some((i) => i.invoiceType === "ADVANCE");
  const finalDefault = s.contract.net.minus(s.collections.totalReceived);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Net contract value" value={<Money value={s.contract.net} />} icon={<Landmark />} tone="info" />
        <KpiCard label={`Advance required (${s.contract.advancePercent.toFixed(0)}%)`} value={<Money value={s.contract.advanceRequired} />} sub={<>Outstanding <Money value={s.collections.advanceOutstanding} /></>} tone={s.collections.advanceOutstanding.isZero() ? "good" : "warn"} icon={<Receipt />} />
        <KpiCard
          label="Total invoiced"
          value={<Money value={invoiced} />}
          sub={<>Uninvoiced <Money value={s.contract.net.minus(invoiced)} /></>}
          icon={<FileText />}
          progress={s.contract.net.isZero() ? 0 : invoiced.dividedBy(s.contract.net).times(100).toNumber()}
        />
        <KpiCard
          label="Total received"
          value={<Money value={s.collections.totalReceived} />}
          icon={<PiggyBank />}
          tone="good"
          progress={s.contract.net.isZero() ? 0 : s.collections.totalReceived.dividedBy(s.contract.net).times(100).toNumber()}
        />
        <KpiCard label="Client balance" value={<Money value={s.collections.outstandingClientBalance} />} icon={<Scale />} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Statuses update automatically as receipts are linked.</CardDescription>
          </div>
          {canInvoice && data.project.status === "APPROVED" && (
            <Drawer
              trigger={<><FilePlus2 /> New invoice</>}
              triggerVariant="accent"
              title="New invoice"
              description={
                <>
                  Leave the amount blank to auto-calculate. Advance = {formatLKR(s.contract.advanceRequired)}
                  {hasAdvance ? " (already raised)" : ""}; Final = net contract − receipts = {formatLKR(finalDefault)}.
                </>
              }
            >
              <ActionForm action={createInvoice.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice type" className="sm:col-span-2">
                  <Select name="invoiceType" defaultValue={hasAdvance ? "PROGRESS" : "ADVANCE"}>
                    {invoiceTypeEnum.enumValues.map((t) => (
                      <option key={t} value={t} disabled={t === "ADVANCE" && hasAdvance}>
                        {INVOICE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Issue date">
                  <Input type="date" name="issueDate" defaultValue={today} required />
                </Field>
                <Field label="Due date">
                  <Input type="date" name="dueDate" />
                </Field>
                <Field label="Amount (Rs.)" hint="Optional for advance / final">
                  <Input name="amount" inputMode="decimal" placeholder="Auto" />
                </Field>
                <Field label="or claim % of contract" hint="Progress invoices only">
                  <Input name="claimPercent" inputMode="decimal" placeholder="e.g. 15" />
                </Field>
                <Field label="Notes (printed on the invoice)" className="sm:col-span-2">
                  <Textarea name="notes" rows={2} />
                </Field>
                <SubmitButton variant="accent" className="sm:col-span-2">Create draft invoice</SubmitButton>
              </ActionForm>
            </Drawer>
          )}
        </CardHeader>
        {data.invoices.length === 0 ? (
          <CardContent>
            <EmptyState title="No invoices yet">Raise the advance invoice once the quotation is approved.</EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Type</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Received</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.invoices.map((inv) => {
                const paid = invoicePaidAmount(inv.id, data.payments);
                const overdue = inv.status !== "PAID" && inv.status !== "DRAFT" && inv.dueDate && inv.dueDate < today;
                return (
                  <TR key={inv.id}>
                    <TD className="font-mono text-xs font-medium">{inv.invoiceNumber}</TD>
                    <TD>{INVOICE_TYPE_LABELS[inv.invoiceType]}</TD>
                    <TD className="text-xs">{formatDate(inv.issueDate)}</TD>
                    <TD className="text-xs">
                      {formatDate(inv.dueDate)} {overdue && <Badge tone="danger">Overdue</Badge>}
                    </TD>
                    <TD className="num"><Money value={inv.amount} prefix={false} /></TD>
                    <TD className="num"><Money value={paid} prefix={false} /></TD>
                    <TD className="num font-medium"><Money value={D(inv.amount).minus(paid)} prefix={false} /></TD>
                    <TD><InvoiceStatusBadge status={inv.status} /></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <a href={`/api/projects/${id}/invoice-pdf?invoiceId=${inv.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                          <Download /> PDF
                        </a>
                        {canInvoice && inv.status === "DRAFT" && (
                          <>
                            <ActionForm action={issueInvoice.bind(null, inv.id)} compact>
                              <SubmitButton size="xs" variant="outline"><Send /> Issue</SubmitButton>
                            </ActionForm>
                            <ActionForm action={deleteInvoice.bind(null, inv.id)} compact confirm={`Delete draft ${inv.invoiceNumber}?`}>
                              <SubmitButton size="icon" variant="danger-ghost" aria-label="Delete draft"><Trash2 /></SubmitButton>
                            </ActionForm>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {canInvoice && data.project.status !== "APPROVED" && (
        <Callout tone="info">Invoices can be raised once the quotation is APPROVED.</Callout>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Client receipts ledger</CardTitle>
            <CardDescription>Every incoming payment (RC-xxx). Refunds are recorded as negative receipts.</CardDescription>
          </div>
          {canReceipt && (
            <Drawer trigger={<><HandCoins /> Record payment</>} triggerVariant="accent" title="Record client payment" description="Creates the next RC-xxx receipt. Attach the bank slip if you have it.">
              <ActionForm action={createPayment.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment date">
                  <Input type="date" name="paymentDate" defaultValue={today} required />
                </Field>
                <Field label="Payment type">
                  <Select name="paymentType" defaultValue={s.collections.advanceOutstanding.isZero() ? "PROGRESS" : "ADVANCE"}>
                    {paymentTypeEnum.enumValues.map((t) => (
                      <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Amount received (Rs.)" hint="For refunds, enter a positive amount">
                  <Input name="amount" inputMode="decimal" required />
                </Field>
                <Field label="Payment method">
                  <Select name="paymentMethod" defaultValue="BANK_TRANSFER">
                    {paymentMethodEnum.enumValues.map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reference / slip / cheque no.">
                  <Input name="referenceNo" />
                </Field>
                <Field label="Against invoice">
                  <Select name="invoiceId" defaultValue="">
                    <option value="">— Not linked —</option>
                    {data.invoices
                      .filter((i) => i.status !== "DRAFT")
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.invoiceNumber} · {INVOICE_TYPE_LABELS[i.invoiceType]} ({i.status})
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Bank slip (photo / PDF)" className="sm:col-span-2">
                  <FileUploadField name="slipBlobUrl" kind="slips" label="Upload slip" />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <Textarea name="notes" rows={2} />
                </Field>
                <SubmitButton variant="accent" className="sm:col-span-2">Record receipt</SubmitButton>
              </ActionForm>
            </Drawer>
          )}
        </CardHeader>
        {data.payments.length === 0 ? (
          <CardContent>
            <EmptyState title="No receipts recorded">Use &ldquo;Record payment&rdquo; when the client pays.</EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Receipt</TH>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH className="text-right">Amount (Rs.)</TH>
                <TH>Method</TH>
                <TH>Reference / slip no.</TH>
                <TH>Invoice</TH>
                <TH>Slip</TH>
                <TH>Notes</TH>
                {canDelete && <TH />}
              </TR>
            </THead>
            <TBody>
              {data.payments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs font-medium">{p.receiptCode}</TD>
                  <TD className="text-xs">{formatDate(p.paymentDate)}</TD>
                  <TD><Badge tone={p.paymentType === "REFUND" ? "danger" : "neutral"}>{PAYMENT_TYPE_LABELS[p.paymentType]}</Badge></TD>
                  <TD className="num font-medium"><Money value={p.amount} prefix={false} /></TD>
                  <TD className="text-xs">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TD>
                  <TD className="text-xs">{p.referenceNo}</TD>
                  <TD className="font-mono text-xs">{p.invoiceId ? invById.get(p.invoiceId)?.invoiceNumber : "—"}</TD>
                  <TD>
                    {p.slipBlobUrl ? (
                      <AttachmentLink url={p.slipBlobUrl} />
                    ) : canReceipt ? (
                      <AttachButton kind="slips" onAttach={attachPaymentSlip.bind(null, p.id)} />
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="max-w-56 text-xs text-muted-foreground">{p.notes}</TD>
                  {canDelete && (
                    <TD>
                      <ActionForm action={deletePayment.bind(null, p.id)} compact confirm={`Delete receipt ${p.receiptCode}? This changes the client balance.`}>
                        <SubmitButton size="icon" variant="danger-ghost" aria-label="Delete receipt"><Trash2 /></SubmitButton>
                      </ActionForm>
                    </TD>
                  )}
                </TR>
              ))}
              <TR className="bg-muted/60 font-semibold">
                <TD colSpan={3}>Total received</TD>
                <TD className="num"><Money value={s.collections.totalReceived} prefix={false} /></TD>
                <TD colSpan={canDelete ? 6 : 5} />
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

    </div>
  );
}
