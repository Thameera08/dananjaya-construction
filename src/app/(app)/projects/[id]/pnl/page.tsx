import { Suspense } from "react";
import { FileSpreadsheet, Lock } from "lucide-react";
import { MoneyBarChart } from "@/components/charts";
import { Money } from "@/components/money";
import { Callout, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/dal";
import { projectSummary, sectionPnl } from "@/lib/finance";
import { formatLKR, formatPct, toNumber, type Numeric } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { cn, todayLK } from "@/lib/utils";

export const metadata = { title: "Section P&L" };

export default function PnlPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PnlContent params={params} />
    </Suspense>
  );
}

async function PnlContent({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const s = projectSummary(data, todayLK());
  const { rows, totals } = sectionPnl(data.items, data.expenses);
  const pending = <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> Pending</span>;
  const reconciles = totals.costIncurred.equals(s.cash.totalIncurred) && totals.cashPaid.equals(s.cash.totalPaidCosts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {reconciles ? (
            <Badge tone="success">✓ Reconciles 100% with the executive dashboard</Badge>
          ) : (
            <Badge tone="danger">Totals do not reconcile — check data</Badge>
          )}
        </div>
        <a href={`/api/projects/${id}/pnl-excel`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <FileSpreadsheet /> Export multi-sheet Excel workbook
        </a>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Section P&L breakdown</CardTitle>
            <CardDescription>
              Costs not tied to a BOQ section fall into &ldquo;Unallocated / Site Overheads&rdquo;, so every rupee is counted exactly once.
            </CardDescription>
          </div>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Work category</TH>
              <TH className="text-right">Quoted sales</TH>
              <TH className="text-right">Budgeted cost</TH>
              <TH className="text-center">Budget items</TH>
              <TH className="text-right">Expected profit</TH>
              <TH className="text-right">Exp. margin</TH>
              <TH className="text-right">Cost incurred</TH>
              <TH className="text-right">Cash paid</TH>
              <TH className="text-right">Budget vs actual</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.category} className={cn(r.isOverheads && "bg-muted/30 italic", r.kind === "personal" && "text-danger", r.kind === "asset" && "text-info")}>
                <TD className="font-medium">{r.category}</TD>
                <TD className="num"><Money value={r.quotedSales} prefix={false} /></TD>
                <TD className="num"><Money value={r.budgetedCost} prefix={false} /></TD>
                <TD className="text-center text-xs">
                  {r.isOverheads ? "—" : <Badge tone={r.itemsComplete === r.itemsTotal ? "success" : "warning"}>{r.itemsComplete}/{r.itemsTotal}</Badge>}
                </TD>
                <TD className="num">{r.isOverheads ? "—" : r.expectedProfit ? <Money value={r.expectedProfit} prefix={false} signTone /> : pending}</TD>
                <TD className="num text-xs">{formatPct(r.expectedMargin, 1)}</TD>
                <TD className="num"><Money value={r.costIncurred} prefix={false} /></TD>
                <TD className="num"><Money value={r.cashPaid} prefix={false} /></TD>
                <TD className="num"><Money value={r.variance} prefix={false} signTone /></TD>
              </TR>
            ))}
            <TR className="bg-muted/60 font-semibold">
              <TD>Total (gross)</TD>
              <TD className="num"><Money value={totals.quotedSales} prefix={false} /></TD>
              <TD className="num"><Money value={totals.budgetedCost} prefix={false} /></TD>
              <TD className="text-center text-xs">{totals.itemsComplete}/{totals.itemsTotal}</TD>
              <TD />
              <TD />
              <TD className="num"><Money value={totals.costIncurred} prefix={false} /></TD>
              <TD className="num"><Money value={totals.cashPaid} prefix={false} /></TD>
              <TD className="num"><Money value={totals.variance} prefix={false} signTone /></TD>
            </TR>
            <TR>
              <TD className="text-muted-foreground">Less: discount ({s.contract.discountPercent.toFixed(2)}%)</TD>
              <TD className="num text-muted-foreground"><Money value={s.contract.discountAmount.negated()} prefix={false} /></TD>
              <TD colSpan={7} />
            </TR>
            <TR className="bg-primary font-semibold text-white">
              <TD>Net contract</TD>
              <TD className="num">{formatLKRPlain(s.contract.net)}</TD>
              <TD className="num">{formatLKRPlain(s.profitability.totalBudgeted)}</TD>
              <TD />
              <TD className="num">{s.profitability.expectedGrossProfit ? formatLKRPlain(s.profitability.expectedGrossProfit) : "Pending"}</TD>
              <TD className="num text-xs">{formatPct(s.profitability.expectedGrossMargin, 1)}</TD>
              <TD className="num">{formatLKRPlain(s.cash.totalIncurred)}</TD>
              <TD className="num">{formatLKRPlain(s.cash.totalPaidCosts)}</TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Expected profit after deductions</CardTitle>
            <CardDescription>Costs outside the BOQ budget come straight off the project&apos;s profit.</CardDescription>
          </div>
        </CardHeader>
        <Table>
          <TBody>
            <TR>
              <TD>Expected gross profit (net contract − budgeted costs)</TD>
              <TD className="num">{s.profitability.expectedGrossProfit ? <Money value={s.profitability.expectedGrossProfit} /> : pending}</TD>
            </TR>
            <TR>
              <TD className="text-muted-foreground">Less: unbudgeted site overheads (food, transport, misc.)</TD>
              <TD className="num text-muted-foreground"><Money value={s.profitability.siteOverheads.negated()} /></TD>
            </TR>
            <TR>
              <TD className="text-muted-foreground">Less: personal withdrawals</TD>
              <TD className="num text-muted-foreground"><Money value={s.profitability.personal.negated()} /></TD>
            </TR>
            <TR>
              <TD className="text-muted-foreground">Less: company assets (tools &amp; hardware kept)</TD>
              <TD className="num text-muted-foreground"><Money value={s.profitability.companyAssets.negated()} /></TD>
            </TR>
            <TR className="bg-primary font-semibold text-white hover:bg-primary">
              <TD>Expected net profit {s.profitability.expectedNetMargin ? `(${formatPct(s.profitability.expectedNetMargin)})` : ""}</TD>
              <TD className="num">{s.profitability.expectedNetProfit ? formatLKR(s.profitability.expectedNetProfit) : "Pending"}</TD>
            </TR>
          </TBody>
        </Table>
      </Card>

      <Callout tone="warn" title="Cash Position ≠ Final Net Profit">
        Uncompleted scope, unrecorded bills, and unpaid supplier invoices will affect final project profit. Variance is budget − incurred:
        negative means the section has already spent more than budgeted.
      </Callout>

      <Card>
        <CardHeader>
          <CardTitle>Budget vs actual by section</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyBarChart
            xKey="name"
            data={rows.map((r) => ({ name: r.kind === "overheads" ? "Site Overheads" : r.kind === "personal" ? "Personal" : r.kind === "asset" ? "Company assets" : r.category, Budget: toNumber(r.budgetedCost), Incurred: toNumber(r.costIncurred), Paid: toNumber(r.cashPaid) }))}
            series={[
              { key: "Budget", label: "Budgeted cost", color: "#d97706" },
              { key: "Incurred", label: "Cost incurred", color: "#b91c1c" },
              { key: "Paid", label: "Cash paid", color: "#1c2230" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatLKRPlain(v: Numeric) {
  return formatLKR(v, { prefix: false });
}
