import { Suspense } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { MoneyBarChart } from "@/components/charts";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout, EmptyState, PageHeader, PageSkeleton } from "@/components/page";
import { QuotationStatusBadge } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal";
import { projectSummary } from "@/lib/finance";
import { D, formatPct, toNumber } from "@/lib/money";
import { getAllProjectsData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { todayLK } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const all = await getAllProjectsData();
  const today = todayLK();
  const rows = all.map((d) => ({ d, s: projectSummary(d, today) }));
  const approved = rows.filter((r) => r.d.project.status === "APPROVED");
  const t = (f: (r: (typeof rows)[number]) => ReturnType<typeof D>) => approved.reduce((a, r) => a.plus(f(r)), D(0));

  const contract = t((r) => r.s.contract.net);
  const received = t((r) => r.s.collections.totalReceived);
  const incurred = t((r) => r.s.cash.totalIncurred);
  const paid = t((r) => r.s.cash.totalPaidCosts);
  const payables = t((r) => r.s.cash.accountsPayable);
  const overdue = approved.reduce((n, r) => n + r.s.cash.overdueCount, 0);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Portfolio position across approved projects (LKR)."
        actions={
          can(user.role, "createProject") ? (
            <Link href="/projects/new" className={buttonVariants({ variant: "accent" })}>
              <Plus /> New project
            </Link>
          ) : null
        }
      />
      {denied && (
        <div className="mb-4">
          <Callout tone="danger">Your role doesn&apos;t have access to that page.</Callout>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No projects yet">
          Create your first project, or run <code>npm run db:seed</code> to load the Gameon World sample.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <KpiCard label="Approved contract value" value={<Money value={contract} />} sub={`${approved.length} approved project(s)`} icon={<FolderKanban />} />
            <KpiCard label="Received from clients" value={<Money value={received} />} />
            <KpiCard label="Client balance outstanding" value={<Money value={contract.minus(received)} />} />
            <KpiCard label="Costs incurred" value={<Money value={incurred} />} />
            <KpiCard label="Vendor payables" value={<Money value={payables} />} tone={overdue ? "bad" : "default"} sub={overdue ? `${overdue} overdue bill(s)` : undefined} />
            <KpiCard label="Net cash position" value={<Money value={received.minus(paid)} signTone />} tone={received.minus(paid).isNegative() ? "bad" : "good"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cash by project</CardTitle>
            </CardHeader>
            <CardContent>
              <MoneyBarChart
                xKey="name"
                data={rows.map(({ d, s }) => ({
                  name: d.project.projectCode,
                  Contract: toNumber(s.contract.net),
                  Received: toNumber(s.collections.totalReceived),
                  Incurred: toNumber(s.cash.totalIncurred),
                  Paid: toNumber(s.cash.totalPaidCosts),
                }))}
                series={[
                  { key: "Contract", label: "Net contract", color: "#1c2230" },
                  { key: "Received", label: "Received", color: "#15803d" },
                  { key: "Incurred", label: "Incurred", color: "#d97706" },
                  { key: "Paid", label: "Paid out", color: "#b91c1c" },
                ]}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ d, s }) => (
              <Link key={d.project.id} href={`/projects/${d.project.id}`} className="block rounded-lg border border-border bg-card p-4 shadow-xs transition hover:border-accent">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.project.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.customer.name} · {d.project.quotationNumber}
                    </p>
                  </div>
                  <QuotationStatusBadge status={d.project.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                  <Stat k="Net contract" v={<Money value={s.contract.net} />} />
                  <Stat k="Received" v={<Money value={s.collections.totalReceived} />} />
                  <Stat k="Advance due" v={<Money value={s.collections.advanceOutstanding} />} />
                  <Stat k="Incurred" v={<Money value={s.cash.totalIncurred} />} />
                  <Stat k="Net cash" v={<Money value={s.cash.netCashPosition} signTone />} />
                  <Stat
                    k={`Exp. margin (${s.profitability.progress.completed}/${s.profitability.progress.total})`}
                    v={s.profitability.expectedGrossMargin ? formatPct(s.profitability.expectedGrossMargin) : <span className="text-muted-foreground">Pending</span>}
                  />
                </dl>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
