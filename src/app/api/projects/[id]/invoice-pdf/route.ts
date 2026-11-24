import { authorize } from "@/lib/dal";
import { renderInvoicePdf } from "@/lib/pdf";
import { getProjectData } from "@/lib/queries";

/** GET /api/projects/:id/invoice-pdf?invoiceId=… */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const invoiceId = new URL(req.url).searchParams.get("invoiceId");
  const data = await getProjectData(id);
  const invoice = data?.invoices.find((i) => i.id === invoiceId);
  if (!data || !invoice) return new Response("Not found", { status: 404 });
  const bytes = await renderInvoicePdf(data.project, data.customer, data.items, invoice, data.invoices, data.payments);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
