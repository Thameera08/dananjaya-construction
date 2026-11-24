import { authorize } from "@/lib/dal";
import { renderQuotationPdf } from "@/lib/pdf";
import { getProjectData } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const data = await getProjectData(id);
  if (!data) return new Response("Not found", { status: 404 });
  const bytes = await renderQuotationPdf(data.project, data.customer, data.items);
  const name = `Quotation-${data.project.quotationNumber.replace(/[^A-Za-z0-9]/g, "")}-${data.project.projectCode}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
