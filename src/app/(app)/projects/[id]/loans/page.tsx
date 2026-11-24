import { Suspense } from "react";
import { HandCoins, History, Plus, Trash2, Undo2, Users, Wallet, CheckCircle2 } from "lucide-react";
import { createLoan, deleteLoan, deleteLoanRecovery, recordLoanRecovery } from "@/actions/loans";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { loanRecoveryMethodEnum, paymentMethodEnum } from "@/db/schema";
import { LOAN_RECOVERY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { loanRows } from "@/lib/finance";
import { formatLKR, sum } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { formatDate, todayLK } from "@/lib/utils";

export const metadata = { title: "Labour Loans" };

export default function LoansPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LoansContent params={params} />
    </Suspense>
  );
}

async function LoansContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const today = todayLK();
  const rows = loanRows(data.loans ?? [], data.loanRecoveries ?? []);
  const given = sum(rows, (r) => r.loan.amount);
  const recovered = sum(rows, (r) => r.recovered);
  const outstanding = given.minus(recovered);
  const canEdit = can(user.role, "manageExpenses");
  const canDelete = can(user.role, "deleteFinancialRecords");
  const workers = [...new Set(rows.map((r) => r.loan.workerName))].sort();
  const wageBills = data.expenses.filter((e) => e.costType === "LABOUR");

  // Per-worker balances
  const byWorker = workers
    .map((w) => {
      const mine = rows.filter((r) => r.loan.workerName === w);
      return { worker: w, loans: mine.length, outstanding: sum(mine, (r) => r.outstanding) };
    })
    .filter((w) => w.outstanding.greaterThan(0));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Loans given" value={<Money value={given} />} sub={`${rows.length} loan(s) · ${workers.length} worker(s)`} icon={<HandCoins />} tone="info" />
        <KpiCard
          label="Recovered"
          value={<Money value={recovered} />}
          icon={<CheckCircle2 />}
          tone="good"
          progress={given.isZero() ? undefined : recovered.dividedBy(given).times(100).toNumber()}
        />
        <KpiCard
          label="Outstanding"
          value={<Money value={outstanding} />}
          icon={<Wallet />}
          tone={outstanding.isZero() ? "good" : "warn"}
          sub="Still owed by workers; reduces cash on hand"
        />
        <KpiCard label="Workers owing" value={byWorker.length} icon={<Users />} sub={byWorker.length ? byWorker.map((w) => w.worker).slice(0, 3).join(", ") : "Nobody owes anything"} />
      </div>

      <Callout tone="info" title="How labour loans work">
        A wage advance is <strong>not a project cost</strong>, because the worker pays it back. It lowers cash on hand until it is recovered.
        When you pay the worker&apos;s wages, record the <strong>full wage</strong> as a Labour expense and pay it with &ldquo;Pay&rdquo;, then
        record a recovery here (&ldquo;Deducted from wages&rdquo;) for the part you held back.
      </Callout>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Loan ledger</CardTitle>
            <CardDescription>Wage advances and loans to workers (LL-xxx)</CardDescription>
          </div>
          {canEdit && (
            <Drawer trigger={<><Plus /> New loan</>} triggerVariant="accent" title="Record labour loan" description="Money given to a worker in advance of their wages.">
              <ActionForm action={createLoan.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
                <Field label="Worker name" className="sm:col-span-2">
                  <Input name="workerName" list="loan-workers" required autoComplete="off" placeholder="e.g. Sunil (painter)" />
                  <datalist id="loan-workers">
                    {workers.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Date">
                  <Input type="date" name="loanDate" defaultValue={today} required />
                </Field>
                <Field label="Amount (Rs.)">
                  <Input name="amount" inputMode="decimal" required />
                </Field>
                <Field label="Paid via" className="sm:col-span-2">
                  <Select name="paymentMethod" defaultValue="CASH">
                    {paymentMethodEnum.enumValues.map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <Textarea name="notes" rows={2} placeholder="e.g. Advance against week 3 wages" />
                </Field>
                <SubmitButton variant="accent" className="sm:col-span-2">Record loan</SubmitButton>
              </ActionForm>
            </Drawer>
          )}
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title="No labour loans" icon={<HandCoins />}>
              Record a loan when a worker takes an advance from their wages.
            </EmptyState>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Loan / date</TH>
                <TH>Worker</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Recovered</TH>
                <TH className="text-right">Outstanding</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.loan.id}>
                  <TD className="whitespace-nowrap">
                    <p className="font-mono text-xs font-semibold">{r.loan.loanCode}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(r.loan.loanDate)} · {PAYMENT_METHOD_LABELS[r.loan.paymentMethod]}</p>
                  </TD>
                  <TD>
                    <p className="font-medium">{r.loan.workerName}</p>
                    {r.loan.notes && <p className="text-xs text-muted-foreground">{r.loan.notes}</p>}
                  </TD>
                  <TD className="num"><Money value={r.loan.amount} prefix={false} /></TD>
                  <TD className="num"><Money value={r.recovered} prefix={false} /></TD>
                  <TD className="num font-medium">
                    {r.settled ? <Badge tone="success">Settled</Badge> : <Money value={r.outstanding} prefix={false} />}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
                      {canEdit && !r.settled && (
                        <Drawer
                          trigger={<><Undo2 className="size-3.5" /> Recover</>}
                          triggerVariant="ghost"
                          triggerSize="xs"
                          title={`Recover ${r.loan.loanCode}`}
                          description={`${r.loan.workerName} owes ${formatLKR(r.outstanding)}`}
                        >
                          <ActionForm action={recordLoanRecovery.bind(null, r.loan.id)} className="grid gap-4 sm:grid-cols-2">
                            <Field label="Date">
                              <Input type="date" name="recoveryDate" defaultValue={today} required />
                            </Field>
                            <Field label="Amount (Rs.)">
                              <Input name="amount" inputMode="decimal" defaultValue={r.outstanding.toFixed(2)} required />
                            </Field>
                            <Field label="How" className="sm:col-span-2">
                              <Select name="method" defaultValue="WAGE_DEDUCTION">
                                {loanRecoveryMethodEnum.enumValues.map((m) => (
                                  <option key={m} value={m}>{LOAN_RECOVERY_LABELS[m]}</option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="From wage bill (if deducted)" className="sm:col-span-2" hint="The Labour expense the deduction was made from">
                              <Select name="expenseId" defaultValue="">
                                <option value="">— Not linked —</option>
                                {wageBills.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.costCode} · {e.vendorDetails.slice(0, 40)} · {formatLKR(e.totalCost)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Notes" className="sm:col-span-2">
                              <Input name="notes" />
                            </Field>
                            <SubmitButton variant="accent" className="sm:col-span-2">Record recovery</SubmitButton>
                          </ActionForm>
                        </Drawer>
                      )}
                      {r.recoveries.length > 0 && (
                        <Drawer
                          trigger={<><History className="size-3.5" /> {r.recoveries.length}</>}
                          triggerVariant="ghost"
                          triggerSize="xs"
                          triggerLabel="Recovery history"
                          title={`Recoveries · ${r.loan.loanCode}`}
                          description={r.loan.workerName}
                        >
                          <ul className="divide-y divide-border text-sm">
                            {r.recoveries.map((rec) => {
                              const bill = rec.expenseId ? data.expenses.find((e) => e.id === rec.expenseId) : null;
                              return (
                                <li key={rec.id} className="flex items-center justify-between gap-3 py-2.5">
                                  <span>
                                    {formatDate(rec.recoveryDate)} · {LOAN_RECOVERY_LABELS[rec.method]}
                                    {bill ? ` · ${bill.costCode}` : ""}
                                    {rec.notes ? <span className="block text-xs text-muted-foreground">{rec.notes}</span> : null}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Money value={rec.amount} />
                                    {canDelete && (
                                      <ActionForm action={deleteLoanRecovery.bind(null, rec.id)} compact confirm="Reverse this recovery?">
                                        <SubmitButton size="icon" variant="danger-ghost" className="size-7" aria-label="Reverse recovery"><Undo2 /></SubmitButton>
                                      </ActionForm>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </Drawer>
                      )}
                      {canDelete && (
                        <ActionForm action={deleteLoan.bind(null, r.loan.id)} compact confirm={`Delete ${r.loan.loanCode} and its recoveries?`}>
                          <SubmitButton size="icon" variant="danger-ghost" aria-label={`Delete ${r.loan.loanCode}`} title={`Delete ${r.loan.loanCode}`}><Trash2 /></SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
              <TR className="bg-muted/60 font-semibold">
                <TD colSpan={2}>Totals</TD>
                <TD className="num"><Money value={given} prefix={false} /></TD>
                <TD className="num"><Money value={recovered} prefix={false} /></TD>
                <TD className="num"><Money value={outstanding} prefix={false} /></TD>
                <TD />
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      {byWorker.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance by worker</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {byWorker.map((w) => (
                <TR key={w.worker}>
                  <TD className="font-medium">{w.worker}</TD>
                  <TD className="text-xs text-muted-foreground">{w.loans} loan(s)</TD>
                  <TD className="num font-semibold"><Money value={w.outstanding} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

