import { AlertTriangle, Banknote, Calculator, Lock, TrendingUp, Wallet } from "lucide-react";
import { KpiCard, KpiGroup } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout } from "@/components/page";
import type { ProjectSummary } from "@/lib/finance";
import { formatPct } from "@/lib/money";

export function ExecutiveKpis({ s }: { s: ProjectSummary }) {
  const p = s.profitability;
  const pending = <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Lock className="size-3.5" /> Pending full BOQ estimation</span>;
  return (
    <div className="space-y-6">
      <Callout tone="warn" title="Cash Position ≠ Final Net Profit">
        Uncompleted scope, unrecorded bills, and unpaid supplier invoices will affect final project profit.
      </Callout>

      <KpiGroup title="Collections">
        <KpiCard label="Net Contract Value" value={<Money value={s.contract.net} />} sub={<>Gross <Money value={s.contract.gross} /> less {s.contract.discountPercent.toFixed(2)}% discount</>} icon={<Banknote />} />
        <KpiCard label={`Advance Required (${s.contract.advancePercent.toFixed(0)}%)`} value={<Money value={s.contract.advanceRequired} />} />
        <KpiCard label="Advance Received" value={<Money value={s.collections.advanceReceived} />} tone={s.collections.advanceOutstanding.isZero() ? "good" : "default"} />
        <KpiCard label="Advance Outstanding" value={<Money value={s.collections.advanceOutstanding} />} tone={s.collections.advanceOutstanding.isZero() ? "good" : "warn"} />
        <KpiCard label="Total Received from Client" value={<Money value={s.collections.totalReceived} />} sub={s.collections.refunds.isZero() ? undefined : <>incl. refunds <Money value={s.collections.refunds} /></>} />
        <KpiCard label="Outstanding Client Balance" value={<Money value={s.collections.outstandingClientBalance} />} />
      </KpiGroup>

      <KpiGroup title="Profitability">
        <KpiCard
          label="Cost Budget Completed"
          value={`${p.progress.completed} / ${p.progress.total}`}
          sub={p.progress.complete ? "All active items estimated" : `${p.progress.total - p.progress.completed} item(s) awaiting a planned cost`}
          tone={p.progress.complete ? "good" : "warn"}
          icon={<Calculator />}
        />
        <KpiCard label="Total Budgeted Costs" value={<Money value={p.totalBudgeted} />} />
        <KpiCard label="Expected Gross Profit" value={p.expectedGrossProfit ? <Money value={p.expectedGrossProfit} signTone /> : pending} tone={p.expectedGrossProfit ? (p.expectedGrossProfit.isNegative() ? "bad" : "good") : "muted"} icon={<TrendingUp />} />
        <KpiCard label="Expected Gross Margin" value={p.expectedGrossMargin ? formatPct(p.expectedGrossMargin) : pending} tone={p.expectedGrossMargin ? "default" : "muted"} />
      </KpiGroup>

      <KpiGroup title="Cash & Payables">
        <KpiCard label="Total Incurred Costs" value={<Money value={s.cash.totalIncurred} />} icon={<Wallet />} />
        <KpiCard label="Paid Costs (Cash Outflows)" value={<Money value={s.cash.totalPaidCosts} />} />
        <KpiCard
          label="Outstanding Vendor Payments"
          value={<Money value={s.cash.accountsPayable} />}
          sub={s.cash.overdueCount ? <span className="flex items-center gap-1 text-danger"><AlertTriangle className="size-3" /> {s.cash.overdueCount} overdue · <Money value={s.cash.overduePayables} /></span> : "Accounts payable"}
          tone={s.cash.overdueCount ? "bad" : "default"}
        />
        <KpiCard label="Net Cash Position" value={<Money value={s.cash.netCashPosition} signTone />} sub="Client receipts − paid costs" tone={s.cash.netCashPosition.isNegative() ? "bad" : "good"} />
        <KpiCard label="Unadjusted Revenue Less Incurred Costs" value={<Money value={s.cash.unadjustedRevenueLessIncurred} signTone />} sub="Net contract − incurred costs (not final profit)" />
      </KpiGroup>
    </div>
  );
}
