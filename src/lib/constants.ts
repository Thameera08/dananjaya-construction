import type { CostType, InvoiceType, PaymentMethod, PaymentType, UserRole } from "@/db/schema";

export const DEFAULT_WORK_CATEGORIES = [
  "Painting Walls",
  "Electrical Works",
  "Door Hardware & Repairs",
  "Chairman Room Repairing",
  "Zebra Blinds",
  "Carpet & Vinyl",
  "Office Furniture",
] as const;

/** Categories for expenses that are not tied to a BOQ section. */
export const OVERHEAD_CATEGORIES = ["Food", "Transport", "Hardware Deposit", "Misc"] as const;

export const UNALLOCATED_SECTION = "Unallocated / Site Overheads";

export const UNITS = ["sq. ft.", "lot", "pcs", "m", "points", "set"] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin (Owner / PM)",
  ESTIMATOR: "Estimator (QS)",
  ACCOUNTANT: "Accountant (Site Cashier)",
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  ADVANCE: "Advance Invoice",
  PROGRESS: "Progress Invoice",
  FINAL: "Final Invoice",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  ADVANCE: "Advance",
  PROGRESS: "Progress",
  FINAL: "Final",
  REFUND: "Refund",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

export const COST_TYPE_LABELS: Record<CostType, string> = {
  LABOUR: "Labour",
  SUPPLIER: "Supplier",
  SUBCONTRACTOR: "Subcontractor",
  OTHER: "Other",
};
