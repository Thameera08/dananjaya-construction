import type { UserRole } from "@/db/schema";

/** Permission matrix. Safe to import from client components (no secrets). */
export const PERMISSIONS = {
  manageUsers: ["ADMIN"],
  createProject: ["ADMIN", "ESTIMATOR"],
  editProject: ["ADMIN", "ESTIMATOR"],
  editQuotation: ["ADMIN", "ESTIMATOR"],
  approveQuotation: ["ADMIN"],
  editBudget: ["ADMIN", "ESTIMATOR"],
  manageInvoices: ["ADMIN", "ACCOUNTANT"],
  manageReceipts: ["ADMIN", "ACCOUNTANT"],
  manageExpenses: ["ADMIN", "ACCOUNTANT"],
  deleteFinancialRecords: ["ADMIN"],
  uploadFiles: ["ADMIN", "ACCOUNTANT"],
  manageInventory: ["ADMIN", "ACCOUNTANT"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
