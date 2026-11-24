import { Suspense } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { MoneyBarChart } from "@/components/charts";
import { ExecutiveKpis } from "@/components/executive-kpis";
import { PageSkeleton } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal";
import { projectSummary, sectionPnl } from "@/lib/finance";
import { toNumber } from "@/lib/money";
import { requireProjectData } from "@/lib/queries";
import { todayLK } from "@/lib/utils";

export default function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await requireProjectData(id);
  const s = projectSummary(data, todayLK());
  const pnl = sectionPnl(data.items, data.expenses);
  const chart = pnl.rows
    .filter((r) => !r.quotedSales.isZero() || !r.costIncurred.isZero())
    .map((r) => ({
      name: r.isOverheads ? "Site Overheads" : r.category,
      Sales: toNumber(r.quotedSales),
      Budget: toNumber(r.budgetedCost),
      Incurred: toNumber(r.costIncurred),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <a href={`/api/projects/${id}/quotation-pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Quotation PDF
        </a>
        <a href={`/api/projects/${id}/pnl-excel`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <FileSpreadsheet /> Export P&L (Excel)
        </a>
      </div>
      <ExecutiveKpis s={s} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales vs budget vs incurred, by section</CardTitle>
            <CardDescription>Quoted sales are gross (before the project-level discount).</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <MoneyBarChart
            data={chart}
            xKey="name"
            series={[
              { key: "Sales", label: "Quoted sales", color: "#1c2230" },
              { key: "Budget", label: "Budgeted cost", color: "#d97706" },
              { key: "Incurred", label: "Cost incurred", color: "#b91c1c" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
