import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProjectTabs } from "@/components/nav";
import { QuotationStatusBadge } from "@/components/status";
import { requireUser } from "@/lib/dal";
import { requireProjectData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Projects
      </Link>
      <div className="mb-6 border-b border-border">
        <Suspense fallback={<div className="h-16" />}>
          <ProjectHeading params={params} />
        </Suspense>
        <Suspense fallback={<div className="h-10" />}>
          <ProjectTabs />
        </Suspense>
      </div>
      {children}
    </>
  );
}

async function ProjectHeading({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { project, customer } = await requireProjectData(id);
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <QuotationStatusBadge status={project.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {customer.name} · Customer #{customer.customerCode} · Quotation {project.quotationNumber} ({formatDate(project.quotationDate)})
        </p>
      </div>
    </div>
  );
}
