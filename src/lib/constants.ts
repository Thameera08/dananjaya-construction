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
export const OVERHEAD_CATEGORIES = ["Food", "Transport", "Hardware Items", "Hardware Deposit", "Personal", "Tools & Equipment", "Misc"] as const;

export const UNALLOCATED_SECTION = "Unallocated / Site Overheads";
export const PERSONAL_SECTION = "Personal withdrawals";
export const ASSET_SECTION = "Company assets (tools & hardware)";

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
  PERSONAL: "Personal",
  ASSET: "Company asset",
};

/** Short explanation of how each base type affects the books. */
export const COST_TYPE_HELP: Record<CostType, string> = {
  LABOUR: "Project cost",
  SUPPLIER: "Project cost",
  SUBCONTRACTOR: "Project cost",
  OTHER: "Project cost",
  PERSONAL: "Personal use, deducted from profit",
  ASSET: "Hardware the company keeps, deducted from profit",
};

export const INVENTORY_CATEGORIES = ["Paint & Chemicals", "Electrical", "Hardware", "Timber & Boards", "Flooring", "Plumbing", "Tools", "General"] as const;

export const STOCK_MOVEMENT_LABELS = { IN: "Stock in", OUT: "Issued to site", ADJUST: "Adjustment" } as const;

export const LOAN_RECOVERY_LABELS = { WAGE_DEDUCTION: "Deducted from wages", CASH: "Repaid in cash" } as const;
