import { Suspense } from "react";
import { Lock } from "lucide-react";
import { saveBudget } from "@/actions/budget";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/dal";
import { budgetProgress, budgetRows, projectSummary } from "@/lib/finance";
import { formatPct } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { cn, todayLK } from "@/lib/utils";

export const metadata = { title: "Cost Budget" };

export default function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BudgetContent params={params} />
    </Suspense>
  );
}

async function BudgetContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  if (!data.project.budgetInitializedAt) {
    return (
      <EmptyState title="Cost budget not initialised yet">
        The itemised cost budget opens automatically when the quotation is APPROVED (current status: {data.project.status}).
      </EmptyState>
    );
  }
  const rows = budgetRows(data.items, data.expenses);
  const progress = budgetProgress(data.items);
  const s = projectSummary(data, todayLK());
  const editable = can(user.role, "editBudget");
  const pending = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      <Lock className="size-3.5" /> Pending full BOQ estimation
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Cost budget completed"
          value={`${progress.completed} / ${progress.total} items`}
          tone={progress.complete ? "good" : "warn"}
          sub={
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent" style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} />
            </div>
          }
        />
        <KpiCard label="Total budgeted costs" value={<Money value={s.profitability.totalBudgeted} />} />
        <KpiCard label="Expected gross profit" value={s.profitability.expectedGrossProfit ? <Money value={s.profitability.expectedGrossProfit} signTone /> : pending} tone={s.profitability.expectedGrossProfit ? "default" : "muted"} sub="Net contract value − budgeted costs" />
        <KpiCard label="Expected gross margin" value={s.profitability.expectedGrossMargin ? formatPct(s.profitability.expectedGrossMargin) : pending} tone={s.profitability.expectedGrossMargin ? "default" : "muted"} />
      </div>
      {!progress.complete && (
        <Callout tone="warn">
          Project-level profit and margin stay locked until every active BOQ item has a planned direct cost. Enter <strong>0</strong> for items with no direct cost — blank means &ldquo;not yet estimated&rdquo;.
        </Callout>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Itemised cost budget</CardTitle>
            <CardDescription>
              Client revenue is the gross quoted value per item. Recorded actual costs update live from the expense ledger.
            </CardDescription>
          </div>
        </CardHeader>
        <ActionForm action={saveBudget.bind(null, id)} keepValues className="pb-4">
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Client revenue</TH>
                <TH className="text-right">Planned direct cost</TH>
                <TH className="text-right">Expected profit</TH>
                <TH className="text-right">Margin</TH>
                <TH className="text-right">Recorded actual</TH>
                <TH className="text-right">Remaining budget</TH>
                <TH>Supplier / cost notes</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.item.id} className={cn(r.plannedCost === null && "bg-accent-soft/40")}>
                  <TD className="min-w-64">
                    <span className="font-mono text-xs">{r.item.itemCode}</span>{" "}
                    <span className="text-xs text-muted-foreground">· {r.item.workCategory}</span>
                    <p className="text-sm">{r.item.description}</p>
                  </TD>
                  <TD className="num"><Money value={r.revenue} prefix={false} /></TD>
                  <TD className="text-right">
                    {editable ? (
                      <Input
                        name={`planned_${r.item.id}`}
                        defaultValue={r.plannedCost === null ? "" : r.item.plannedCost!}
                        inputMode="decimal"
                        placeholder="Not estimated"
                        className="h-8 w-36 text-right tabular-nums"
                        aria-label={`Planned cost ${r.item.itemCode}`}
                      />
                    ) : r.plannedCost === null ? (
                      <Badge tone="warning">Not estimated</Badge>
                    ) : (
                      <Money value={r.plannedCost} prefix={false} />
                    )}
                  </TD>
                  <TD className="num">{r.expectedProfit ? <Money value={r.expectedProfit} prefix={false} signTone /> : "—"}</TD>
                  <TD className="num text-xs">{formatPct(r.expectedMargin, 1)}</TD>
                  <TD className="num"><Money value={r.actualCost} prefix={false} /></TD>
                  <TD className="num">
                    {r.remainingBudget ? (
                      <span className="inline-flex items-center gap-1">
                        <Money value={r.remainingBudget} prefix={false} />
                        {r.overBudget && <Badge tone="danger">Over</Badge>}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    {editable ? (
                      <Input name={`notes_${r.item.id}`} defaultValue={r.item.costNotes ?? ""} className="h-8 min-w-48 text-xs" aria-label={`Notes ${r.item.itemCode}`} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.item.costNotes}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {editable && (
            <div className="flex justify-end gap-2 px-5 pt-4">
              <SubmitButton variant="accent">Save cost budget</SubmitButton>
            </div>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
