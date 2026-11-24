import {
  AlertTriangle,
  Banknote,
  Calculator,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Lock,
  MinusCircle,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Trophy,
  Truck,
  Wallet,
} from "lucide-react";
import { KpiCard, KpiGroup } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { Callout } from "@/components/page";
import type { ProjectSummary } from "@/lib/finance";
import { D, formatPct, type Numeric } from "@/lib/money";

const pct = (part: Numeric, whole: Numeric) => {
  const w = D(whole);
  return w.isZero() ? 0 : D(part).dividedBy(w).times(100).toNumber();
};

export function ExecutiveKpis({ s }: { s: ProjectSummary }) {
  const p = s.profitability;
  const pending = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      <Lock className="size-3.5" /> Pending full BOQ estimation
    </span>
  );
  const advanceDone = s.collections.advanceOutstanding.isZero();
  const gpTone = p.expectedGrossProfit ? (p.expectedGrossProfit.isNegative() ? "bad" : "good") : "muted";

  return (
    <div className="space-y-8">
      <Callout tone="warn" title="Cash Position ≠ Final Net Profit">
        Uncompleted scope, unrecorded bills, and unpaid supplier invoices will affect final project profit.
      </Callout>

      <KpiGroup title="Collections" icon={<HandCoins />}>
        <KpiCard
          label="Net Contract Value"
          value={<Money value={s.contract.net} />}
          sub={<>Gross <Money value={s.contract.gross} /> less {s.contract.discountPercent.toFixed(2)}% discount</>}
          icon={<Banknote />}
          tone="info"
        />
        <KpiCard label={`Advance Required (${s.contract.advancePercent.toFixed(0)}%)`} value={<Money value={s.contract.advanceRequired} />} icon={<Landmark />} />
        <KpiCard
          label="Advance Received"
          value={<Money value={s.collections.advanceReceived} />}
          progress={pct(s.collections.advanceReceived, s.contract.advanceRequired)}
          sub={`${Math.round(pct(s.collections.advanceReceived, s.contract.advanceRequired))}% of the advance collected`}
          tone={advanceDone ? "good" : "warn"}
          icon={<Receipt />}
        />
        <KpiCard
          label="Advance Outstanding"
          value={<Money value={s.collections.advanceOutstanding} />}
          tone={advanceDone ? "good" : "warn"}
          icon={<AlertTriangle />}
          sub={advanceDone ? "Advance fully received" : "Follow up before work commences"}
        />
        <KpiCard
          label="Total Received from Client"
          value={<Money value={s.collections.totalReceived} />}
          progress={pct(s.collections.totalReceived, s.contract.net)}
          sub={
            s.collections.refunds.isZero() ? (
              `${Math.round(pct(s.collections.totalReceived, s.contract.net))}% of the contract collected`
            ) : (
              <>incl. refunds <Money value={s.collections.refunds} /></>
            )
          }
          tone="good"
          icon={<PiggyBank />}
        />
        <KpiCard label="Outstanding Client Balance" value={<Money value={s.collections.outstandingClientBalance} />} icon={<Scale />} />
      </KpiGroup>

      <KpiGroup title="Profitability" icon={<TrendingUp />}>
        <KpiCard
          label="Cost Budget Completed"
          value={`${p.progress.completed} / ${p.progress.total}`}
          progress={pct(p.progress.completed, p.progress.total)}
          sub={p.progress.complete ? "All active items estimated" : `${p.progress.total - p.progress.completed} item(s) awaiting a planned cost`}
          tone={p.progress.complete ? "good" : "warn"}
          icon={<Calculator />}
        />
        <KpiCard label="Total Budgeted Costs" value={<Money value={p.totalBudgeted} />} icon={<Wallet />} />
        <KpiCard
          label="Expected Gross Profit"
          value={p.expectedGrossProfit ? <Money value={p.expectedGrossProfit} /> : pending}
          tone={gpTone}
          icon={<TrendingUp />}
          sub={p.expectedGrossProfit ? "Net contract − budgeted costs" : undefined}
        />
        <KpiCard
          label="Expected Gross Margin"
          value={p.expectedGrossMargin ? formatPct(p.expectedGrossMargin) : pending}
          progress={p.expectedGrossMargin ? Math.max(0, p.expectedGrossMargin.toNumber()) : undefined}
          tone={p.expectedGrossMargin ? gpTone : "muted"}
          icon={<Percent />}
        />
        <KpiCard
          label="Deductions from Profit"
          value={<Money value={p.totalDeductions} />}
          tone={p.totalDeductions.isZero() ? "default" : "warn"}
          icon={<MinusCircle />}
          sub={
            <span className="grid gap-0.5">
              <span className="flex justify-between gap-2"><span>Site overheads</span><Money value={p.siteOverheads} /></span>
              <span className="flex justify-between gap-2"><span>Personal</span><Money value={p.personal} /></span>
              <span className="flex justify-between gap-2"><span>Company assets</span><Money value={p.companyAssets} /></span>
            </span>
          }
        />
        <KpiCard
          label="Expected Net Profit"
          value={p.expectedNetProfit ? <Money value={p.expectedNetProfit} /> : pending}
          tone={p.expectedNetProfit ? (p.expectedNetProfit.isNegative() ? "bad" : "good") : "muted"}
          icon={<Trophy />}
          progress={p.expectedNetMargin ? Math.max(0, p.expectedNetMargin.toNumber()) : undefined}
          sub={p.expectedNetProfit ? `Gross profit − deductions · ${formatPct(p.expectedNetMargin)} margin` : undefined}
        />
      </KpiGroup>

      <KpiGroup title="Cash & Payables" icon={<CircleDollarSign />}>
        <KpiCard
          label="Total Incurred Costs"
          value={<Money value={s.cash.totalIncurred} />}
          progress={p.totalBudgeted.isZero() ? undefined : pct(s.cash.totalIncurred, p.totalBudgeted)}
          sub={p.totalBudgeted.isZero() ? undefined : `${Math.round(pct(s.cash.totalIncurred, p.totalBudgeted))}% of budgeted costs`}
          tone="info"
          icon={<Wallet />}
        />
        <KpiCard label="Paid Costs (Cash Outflows)" value={<Money value={s.cash.totalPaidCosts} />} icon={<Banknote />} />
        <KpiCard
          label="Outstanding Vendor Payments"
          value={<Money value={s.cash.accountsPayable} />}
          sub={
            s.cash.overdueCount ? (
              <span className="flex items-center gap-1 text-danger">
                <AlertTriangle className="size-3" /> {s.cash.overdueCount} overdue · <Money value={s.cash.overduePayables} />
              </span>
            ) : (
              "Accounts payable"
            )
          }
          tone={s.cash.overdueCount ? "bad" : s.cash.accountsPayable.isZero() ? "good" : "warn"}
          icon={<Truck />}
        />
        <KpiCard
          label="Net Cash Position"
          value={<Money value={s.cash.netCashPosition} signTone />}
          sub="Client receipts − paid costs − labour loans outstanding"
          tone={s.cash.netCashPosition.isNegative() ? "bad" : "good"}
          icon={<PiggyBank />}
        />
        <KpiCard
          label="Labour Loans Outstanding"
          value={<Money value={s.loans.outstanding} />}
          tone={s.loans.outstanding.isZero() ? "default" : "warn"}
          icon={<HandCoins />}
          sub={s.loans.count ? <>Given <Money value={s.loans.given} /> · recovered <Money value={s.loans.recovered} /></> : "No wage advances"}
        />
        <KpiCard
          label="Unadjusted Revenue Less Incurred Costs"
          value={<Money value={s.cash.unadjustedRevenueLessIncurred} signTone />}
          sub="Net contract − incurred costs (not final profit)"
          icon={<Scale />}
        />
      </KpiGroup>
    </div>
  );
}
