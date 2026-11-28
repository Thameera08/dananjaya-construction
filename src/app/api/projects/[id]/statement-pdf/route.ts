import { authorize } from "@/lib/dal";
import { renderStatementPdf } from "@/lib/pdf";
import { getProjectData } from "@/lib/queries";
import { todayLK } from "@/lib/utils";

/** GET /api/projects/:id/statement-pdf */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const data = await getProjectData(id);
  if (!data) return new Response("Not found", { status: 404 });
  const bytes = await renderStatementPdf(data.project, data.customer, data.items, data.invoices, data.payments, todayLK());
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Statement-${data.project.quotationNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
