import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, HardHat, Info, Package, PiggyBank, Scale, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { MoneyBarChart } from "@/components/charts";
import { KpiCard, Progress } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { EmptyState, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { analyseProject, type Insight } from "@/lib/analysis";
import { COST_TYPE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";
import { projectMaterialUsage } from "@/lib/inventory";
import { D, formatQty, sum, toNumber } from "@/lib/money";
import { getExpensePayments, getInventory, requireProjectData } from "@/lib/queries";
import { cn, formatDate, todayLK } from "@/lib/utils";
import type { CostType } from "@/db/schema";

export const metadata = { title: "Project Analysis" };

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalysisContent params={params} />
    </Suspense>
  );
}

const TONE: Record<Insight["tone"], { icon: React.ReactNode; cls: string }> = {
  bad: { icon: <CircleAlert />, cls: "border-danger/25 bg-danger-soft/60 [&>svg]:text-danger" },
  warn: { icon: <TriangleAlert />, cls: "border-accent/30 bg-accent-soft/50 [&>svg]:text-accent" },
  info: { icon: <Info />, cls: "border-info/20 bg-info-soft/40 [&>svg]:text-info" },
  good: { icon: <CircleCheck />, cls: "border-success/25 bg-success-soft/50 [&>svg]:text-success" },
};

const pct = (n: number) => `${Math.round(n)}%`;

async function AnalysisContent({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const today = todayLK();
  const [expensePayments, inventory] = await Promise.all([getExpensePayments(data.expenses.map((e) => e.id)), getInventory()]);
  const a = analyseProject(data, expensePayments, today);
  const s = a.summary;
  const materials = projectMaterialUsage(inventory.items, inventory.movements, id);
  const materialsValue = sum(materials, (m) => m.value);
  const collectedPct = s.contract.net.isZero() ? 0 : s.collections.totalReceived.dividedBy(s.contract.net).times(100).toNumber();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Collected" value={pct(collectedPct)} sub={<><Money value={s.collections.totalReceived} /> received</>} progress={collectedPct} tone="good" icon={<PiggyBank />} />
        <KpiCard label="Invoiced" value={pct(a.billedPct)} sub={<><Money value={a.invoiced} /> billed</>} progress={a.billedPct} tone="info" icon={<Scale />} />
        <KpiCard
          label="Budget spent"
          value={pct(a.spentPct)}
          sub={<><Money value={s.cash.totalIncurred} /> incurred</>}
          progress={a.spentPct}
          tone={a.spentPct > 100 ? "bad" : a.spentPct > 85 ? "warn" : "default"}
          icon={<Wallet />}
        />
        <KpiCard label="Cash position" value={<Money value={s.cash.netCashPosition} />} sub="Received − paid − open loans" tone={s.cash.netCashPosition.isNegative() ? "bad" : "good"} icon={<TrendingUp />} />
        <KpiCard label="Labour share" value={pct(a.labourShare)} sub={<><Money value={a.labour} /> on labour</>} progress={a.labourShare} icon={<HardHat />} />
        <KpiCard label="Store materials used" value={<Money value={materialsValue} />} sub={`${materials.length} item(s) from inventory`} icon={<Package />} tone="muted" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What&apos;s going on</CardTitle>
            <CardDescription>Automatic health check of budget, cash, billing and costs. Most urgent first.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {a.insights.map((i) => (
            <div key={i.title} className={cn("flex gap-3 rounded-lg border p-3 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0", TONE[i.tone].cls)}>
              {TONE[i.tone].icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{i.title}</p>
                <p className="mt-0.5 text-sm text-foreground/80">{i.detail}</p>
                {i.href && (
                  <Link href={i.href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                    Open <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Monthly cash flow</CardTitle>
            <CardDescription>Client receipts vs payments made to vendors and workers, and costs incurred each month.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {a.monthly.length === 0 ? (
            <EmptyState title="No transactions yet" />
          ) : (
            <MoneyBarChart
              xKey="month"
              data={a.monthly}
              series={[
                { key: "Received", label: "Received from client", color: "#15803d" },
                { key: "Paid", label: "Paid out", color: "#1c2230" },
                { key: "Incurred", label: "Costs incurred", color: "#d97706" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Section budget health</CardTitle>
              <CardDescription>How much of each section&apos;s cost budget is used.</CardDescription>
            </div>
          </CardHeader>
          {a.sectionHealth.length === 0 ? (
            <CardContent><EmptyState title="No budgeted sections yet" /></CardContent>
          ) : (
            <CardContent className="space-y-3">
              {a.sectionHealth.map((r) => (
                <div key={r.category}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{r.category}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <Money value={r.costIncurred} /> / <Money value={r.budgetedCost} />
                      <Badge tone={r.used > 100 ? "danger" : r.used >= 85 ? "warning" : "success"} className="ml-2">{pct(r.used)}</Badge>
                    </span>
                  </div>
                  <Progress value={r.used} tone={r.used > 100 ? "bad" : r.used >= 85 ? "warn" : "good"} className="mt-1" />
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cost mix</CardTitle>
              <CardDescription>Total incurred by what the cost counts as.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {a.byBase.length === 0 ? (
              <EmptyState title="No costs yet" />
            ) : (
              <MoneyBarChart
                xKey="type"
                height={260}
                data={a.byBase.map((g) => ({ type: COST_TYPE_LABELS[g.key as CostType], Incurred: toNumber(g.incurred), Paid: toNumber(g.paid) }))}
                series={[
                  { key: "Incurred", label: "Incurred", color: "#d97706" },
                  { key: "Paid", label: "Paid", color: "#1c2230" },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Labour payments by worker / gang</CardTitle>
              <CardDescription>Grouped by the name before the first &ldquo;:&rdquo; in the expense details.</CardDescription>
            </div>
            <Link href={`/projects/${id}/expenses?type=base:LABOUR`} className="text-xs font-medium text-info hover:underline">See all labour entries</Link>
          </CardHeader>
          {a.labourPayees.length === 0 ? (
            <CardContent><EmptyState title="No labour costs recorded" /></CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Worker / gang</TH>
                  <TH className="text-right">Entries</TH>
                  <TH className="text-right">Charged</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Owed</TH>
                </TR>
              </THead>
              <TBody>
                {a.labourPayees.map((g) => (
                  <TR key={g.key}>
                    <TD>{g.key}</TD>
                    <TD className="num">{g.count}</TD>
                    <TD className="num"><Money value={g.incurred} prefix={false} /></TD>
                    <TD className="num"><Money value={g.paid} prefix={false} /></TD>
                    <TD className="num font-medium">{g.unpaid.isZero() ? <Badge tone="success">Settled</Badge> : <Money value={g.unpaid} prefix={false} />}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Unpaid bills</CardTitle>
              <CardDescription>Earliest due first</CardDescription>
            </div>
            <Link href={`/projects/${id}/expenses?status=unpaid`} className="text-xs font-medium text-info hover:underline">See all</Link>
          </CardHeader>
          {a.unpaidBills.length === 0 ? (
            <CardContent><EmptyState title="Everything is paid" /></CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Bill</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Unpaid</TH>
                </TR>
              </THead>
              <TBody>
                {a.unpaidBills.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <p className="text-sm">{e.vendorDetails}</p>
                      <p className="font-mono text-xs text-muted-foreground">{e.costCode}</p>
                    </TD>
                    <TD className="text-xs whitespace-nowrap">
                      {formatDate(e.dueDate)} {e.dueDate && e.dueDate < today && <Badge tone="danger">Overdue</Badge>}
                    </TD>
                    <TD className="num font-medium"><Money value={D(e.totalCost).minus(D(e.paidToDate))} prefix={false} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Materials issued from the store</CardTitle>
            <CardDescription>Stock sent to this site from Inventory, valued at average purchase cost. Purchases are recorded as expenses, so this is for tracking, not added to profit again.</CardDescription>
          </div>
          <Link href="/inventory" className="text-xs font-medium text-info hover:underline">Open inventory</Link>
        </CardHeader>
        {materials.length === 0 ? (
          <CardContent><EmptyState title="No materials issued to this project" icon={<Package />}>Issue stock from the Inventory page and pick this project.</EmptyState></CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH className="text-right">Issues</TH>
                <TH className="text-right">Qty used</TH>
                <TH className="text-right">Value</TH>
              </TR>
            </THead>
            <TBody>
              {materials.map((m) => (
                <TR key={m.item.id}>
                  <TD>{m.item.name} <span className="font-mono text-xs text-muted-foreground">{m.item.itemCode}</span></TD>
                  <TD className="text-xs">{m.item.category}</TD>
                  <TD className="num">{m.issues}</TD>
                  <TD className="num">{formatQty(m.qty)} <span className="text-xs text-muted-foreground">{m.item.unit}</span></TD>
                  <TD className="num">{m.value ? <Money value={m.value} prefix={false} /> : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
