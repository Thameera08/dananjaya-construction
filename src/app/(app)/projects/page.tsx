import { Suspense } from "react";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page";
import { Money } from "@/components/money";
import { QuotationStatusBadge } from "@/components/status";
import { requireUser } from "@/lib/dal";
import { projectSummary } from "@/lib/finance";
import { getAllProjectsData } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { formatDate, todayLK } from "@/lib/utils";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectsContent />
    </Suspense>
  );
}

async function ProjectsContent() {
  const user = await requireUser();
  const all = await getAllProjectsData();
  const today = todayLK();
  return (
    <>
      <PageHeader
        title="Projects"
        description="Quotations, budgets and project accounts."
        actions={
          can(user.role, "createProject") ? (
            <>
              <Link href="/projects/import" className={buttonVariants({ variant: "outline" })}>
                <FileSpreadsheet /> Import from Excel
              </Link>
              <Link href="/projects/new" className={buttonVariants({ variant: "accent" })}>
                <Plus /> New project
              </Link>
            </>
          ) : null
        }
      />
      {all.length === 0 ? (
        <EmptyState title="No projects yet">Create a project to start a quotation.</EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Project</TH>
                <TH>Customer</TH>
                <TH>Quotation</TH>
                <TH>Status</TH>
                <TH className="text-right">Net contract</TH>
                <TH className="text-right">Received</TH>
                <TH className="text-right">Incurred</TH>
                <TH className="text-right">Budget</TH>
              </TR>
            </THead>
            <TBody>
              {all.map((d) => {
                const s = projectSummary(d, today);
                return (
                  <TR key={d.project.id} className="hover:bg-muted/40">
                    <TD>
                      <Link href={`/projects/${d.project.id}`} className="font-medium hover:underline">
                        {d.project.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{d.project.projectCode}</p>
                    </TD>
                    <TD>
                      {d.customer.name}
                      <p className="text-xs text-muted-foreground">#{d.customer.customerCode}</p>
                    </TD>
                    <TD>
                      {d.project.quotationNumber}
                      <p className="text-xs text-muted-foreground">{formatDate(d.project.quotationDate)}</p>
                    </TD>
                    <TD>
                      <QuotationStatusBadge status={d.project.status} />
                    </TD>
                    <TD className="num"><Money value={s.contract.net} /></TD>
                    <TD className="num"><Money value={s.collections.totalReceived} /></TD>
                    <TD className="num"><Money value={s.cash.totalIncurred} /></TD>
                    <TD className="num text-xs">
                      {s.profitability.progress.completed}/{s.profitability.progress.total}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
