import { authorize } from "@/lib/dal";
import { renderReceiptPdf } from "@/lib/pdf";
import { getProjectData } from "@/lib/queries";

/** GET /api/projects/:id/receipt-pdf?paymentId=… */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const paymentId = new URL(req.url).searchParams.get("paymentId");
  const data = await getProjectData(id);
  const payment = data?.payments.find((p) => p.id === paymentId);
  if (!data || !payment) return new Response("Not found", { status: 404 });
  const bytes = await renderReceiptPdf(data.project, data.customer, data.items, payment, data.invoices, data.payments);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Receipt-${data.project.quotationNumber}-${payment.receiptCode}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
