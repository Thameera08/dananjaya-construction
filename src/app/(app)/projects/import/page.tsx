import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermissionPage } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import from Excel" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import project from Excel"
        description="Upload a Project Profit & Loss Tracker workbook. Check it first: nothing is saved until you click Import."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requirePermissionPage("createProject");
  return (
    <Card className="max-w-4xl">
      <CardContent>
        <ImportForm canReplace={can(user.role, "deleteFinancialRecords")} />
      </CardContent>
    </Card>
  );
}
