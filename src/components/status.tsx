import type { InvoiceStatus, QuotationStatus } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  const tone = status === "APPROVED" ? "success" : status === "SENT" ? "info" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const tone = status === "PAID" ? "success" : status === "PARTIAL" ? "warning" : status === "ISSUED" ? "info" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
