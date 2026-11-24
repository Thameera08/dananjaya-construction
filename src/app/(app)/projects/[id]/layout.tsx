import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, MapPin, Phone, User } from "lucide-react";
import { ProjectTabs } from "@/components/nav";
import { Progress } from "@/components/kpi-card";
import { QuotationStatusBadge } from "@/components/status";
import { requireUser } from "@/lib/dal";
import { projectSummary } from "@/lib/finance";
import { D, formatLKR, type Numeric } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { formatDate, todayLK } from "@/lib/utils";

export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All projects
      </Link>
      <div className="mb-6 rounded-xl border border-border bg-card shadow-xs">
        <Suspense fallback={<HeadingSkeleton />}>
          <ProjectHeading params={params} />
        </Suspense>
        <div className="border-t border-border px-3">
          <Suspense fallback={<div className="h-11" />}>
            <ProjectTabs />
          </Suspense>
        </div>
      </div>
      {children}
    </>
  );
}

function HeadingSkeleton() {
  return (
    <div className="p-5" aria-busy="true">
      <div className="skeleton h-7 w-80" />
      <div className="skeleton mt-2 h-4 w-96" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    </div>
  );
}

const pct = (part: Numeric, whole: Numeric) => {
  const w = D(whole);
  return w.isZero() ? 0 : D(part).dividedBy(w).times(100).toNumber();
};
const short = (v: Numeric) => {
  const n = D(v).abs().toNumber();
  const sign = D(v).isNegative() ? "-" : "";
  if (n >= 1_000_000) return `${sign}Rs. ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sign}Rs. ${(n / 1_000).toFixed(1)}k`;
  return formatLKR(v);
};

async function ProjectHeading({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const { project, customer } = data;
  const s = projectSummary(data, todayLK());
  const budget = s.profitability.totalBudgeted;

  const stats = [
    {
      label: "Collected",
      value: `${short(s.collections.totalReceived)} of ${short(s.contract.net)}`,
      progress: pct(s.collections.totalReceived, s.contract.net),
      tone: "good" as const,
    },
    {
      label: `Advance (${s.contract.advancePercent.toFixed(0)}%)`,
      value: s.collections.advanceOutstanding.isZero() ? "Fully received" : `${short(s.collections.advanceOutstanding)} outstanding`,
      progress: pct(s.collections.advanceReceived, s.contract.advanceRequired),
      tone: s.collections.advanceOutstanding.isZero() ? ("good" as const) : ("warn" as const),
    },
    {
      label: "Budget estimated",
      value: `${s.profitability.progress.completed} / ${s.profitability.progress.total} items`,
      progress: pct(s.profitability.progress.completed, s.profitability.progress.total),
      tone: s.profitability.progress.complete ? ("good" as const) : ("warn" as const),
    },
    {
      label: "Spent vs budget",
      value: `${short(s.cash.totalIncurred)} of ${short(budget)}`,
      progress: pct(s.cash.totalIncurred, budget),
      tone: s.cash.totalIncurred.greaterThan(budget) && !budget.isZero() ? ("bad" as const) : ("info" as const),
    },
  ];

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{project.title}</h1>
            <QuotationStatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">{customer.name}</span> · #{customer.customerCode} · Quotation{" "}
            {project.quotationNumber} · {formatDate(project.quotationDate)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {customer.contactPerson && (
              <span className="inline-flex items-center gap-1"><User className="size-3.5" /> {customer.contactPerson}</span>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Phone className="size-3.5" /> {customer.phone}
              </a>
            )}
            {project.siteAddress && (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {project.siteAddress}</span>
            )}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Net contract</p>
          <p className="text-xl font-semibold tabular-nums md:text-2xl">{formatLKR(s.contract.net)}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((st) => (
          <div key={st.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-muted-foreground">{st.label}</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(Math.min(st.progress, 999))}%</span>
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{st.value}</p>
            <Progress value={st.progress} tone={st.tone} className="mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
