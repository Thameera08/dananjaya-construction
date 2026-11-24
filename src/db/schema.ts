import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** All LKR money columns: NUMERIC(15,2) — exact decimal, never float. */
const money = (name: string) => numeric(name, { precision: 15, scale: 2 });
const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

// ───────────────────────────── Enums ─────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "ESTIMATOR", "ACCOUNTANT"]);
export const quotationStatusEnum = pgEnum("quotation_status", ["DRAFT", "SENT", "APPROVED"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["ADVANCE", "PROGRESS", "FINAL"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "ISSUED", "PARTIAL", "PAID"]);
export const paymentTypeEnum = pgEnum("payment_type", ["ADVANCE", "PROGRESS", "FINAL", "REFUND"]);
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "BANK_TRANSFER", "CHEQUE"]);
/**
 * Base cost behaviour. PERSONAL (owner's personal use of project money) and ASSET
 * (hardware / tools the company keeps) are deducted from project profit but never
 * charged to a BOQ item.
 */
export const costTypeEnum = pgEnum("cost_type", ["LABOUR", "SUPPLIER", "SUBCONTRACTOR", "OTHER", "PERSONAL", "ASSET"]);
export const loanRecoveryMethodEnum = pgEnum("loan_recovery_method", ["WAGE_DEDUCTION", "CASH"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type QuotationStatus = (typeof quotationStatusEnum.enumValues)[number];
export type InvoiceType = (typeof invoiceTypeEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type PaymentType = (typeof paymentTypeEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type CostType = (typeof costTypeEnum.enumValues)[number];
export type LoanRecoveryMethod = (typeof loanRecoveryMethodEnum.enumValues)[number];

// ───────────────────────────── Tables ─────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Always stored lower-cased. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("ACCOUNTANT"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerCode: text("customer_code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short prefix used for BOQ item codes, e.g. "GW" → GW-001. */
    projectCode: text("project_code").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    siteAddress: text("site_address"),
    currency: text("currency").notNull().default("LKR"),
    status: quotationStatusEnum("status").notNull().default("DRAFT"),
    quotationNumber: text("quotation_number").notNull().unique(),
    quotationDate: date("quotation_date").notNull(),
    validUntil: date("valid_until"),
    discountPercent: percent("discount_percent").notNull().default("0"),
    advancePercent: percent("advance_percent").notNull().default("75"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankAccountName: text("bank_account_name"),
    exclusionsNotes: text("exclusions_notes"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    budgetInitializedAt: timestamp("budget_initialized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("projects_discount_range", sql`${t.discountPercent} >= 0 AND ${t.discountPercent} <= 100`),
    check("projects_advance_range", sql`${t.advancePercent} >= 0 AND ${t.advancePercent} <= 100`),
  ],
);

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemCode: text("item_code").notNull(),
    workCategory: text("work_category").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    clientRate: money("client_rate").notNull(),
    /** Stored = round(quantity × client_rate, 2). Recomputed server-side on every write. */
    quotedValue: money("quoted_value").notNull(),
    /** NULL = not yet estimated. 0 is a valid estimate. */
    plannedCost: money("planned_cost"),
    costNotes: text("cost_notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("quotation_items_project_code_uq").on(t.projectId, t.itemCode),
    index("quotation_items_project_idx").on(t.projectId),
    check("quotation_items_qty_nonneg", sql`${t.quantity} >= 0`),
    check("quotation_items_rate_nonneg", sql`${t.clientRate} >= 0`),
    check("quotation_items_planned_nonneg", sql`${t.plannedCost} IS NULL OR ${t.plannedCost} >= 0`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull().unique(),
    invoiceType: invoiceTypeEnum("invoice_type").notNull(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    amount: money("amount").notNull(),
    status: invoiceStatusEnum("status").notNull().default("DRAFT"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_project_idx").on(t.projectId), check("invoices_amount_pos", sql`${t.amount} > 0`)],
);

export const clientPayments = pgTable(
  "client_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    receiptCode: text("receipt_code").notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    /** Positive for receipts, negative for REFUND. */
    amount: money("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    referenceNo: text("reference_no"),
    slipBlobUrl: text("slip_blob_url"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("client_payments_project_code_uq").on(t.projectId, t.receiptCode),
    index("client_payments_project_idx").on(t.projectId),
    check(
      "client_payments_sign",
      sql`(${t.paymentType} = 'REFUND' AND ${t.amount} < 0) OR (${t.paymentType} <> 'REFUND' AND ${t.amount} > 0)`,
    ),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** NULL = UNALLOCATED (site overheads). */
    quotationItemId: uuid("quotation_item_id").references(() => quotationItems.id, { onDelete: "restrict" }),
    costCode: text("cost_code").notNull(),
    expenseDate: date("expense_date").notNull(),
    workCategory: text("work_category").notNull(),
    costType: costTypeEnum("cost_type").notNull(),
    /** Custom cost type name (e.g. "Machinery hire"); its behaviour comes from cost_type. */
    costLabel: text("cost_label"),
    vendorDetails: text("vendor_details").notNull(),
    invoiceRef: text("invoice_ref"),
    dueDate: date("due_date"),
    totalCost: money("total_cost").notNull(),
    paidToDate: money("paid_to_date").notNull().default("0"),
    receiptBlobUrl: text("receipt_blob_url"),
    comments: text("comments"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("expenses_project_code_uq").on(t.projectId, t.costCode),
    index("expenses_project_idx").on(t.projectId),
    index("expenses_item_idx").on(t.quotationItemId),
    check("expenses_total_nonneg", sql`${t.totalCost} >= 0`),
    // Anti-double-entry guardrail at the DB level: disbursements can never exceed the recorded bill.
    check("expenses_paid_within_total", sql`${t.paidToDate} >= 0 AND ${t.paidToDate} <= ${t.totalCost}`),
  ],
);

/** Audit trail of each disbursement logged against an expense's paid_to_date. */
export const expensePayments = pgTable(
  "expense_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    paymentDate: date("payment_date").notNull(),
    amount: money("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    referenceNo: text("reference_no"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expense_payments_expense_idx").on(t.expenseId), check("expense_payments_pos", sql`${t.amount} > 0`)],
);

/** User-created cost types, each behaving like one of the base cost types. */
export const expenseTypes = pgTable("expense_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  baseType: costTypeEnum("base_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** User-created work categories for unallocated costs (e.g. "Hardware Items"). */
export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Wage advances / loans given to workers. Not a project cost: it's money owed back,
 * recovered from later wages or repaid in cash. Outstanding loans reduce cash on hand.
 */
export const labourLoans = pgTable(
  "labour_loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    loanCode: text("loan_code").notNull(),
    workerName: text("worker_name").notNull(),
    loanDate: date("loan_date").notNull(),
    amount: money("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("CASH"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("labour_loans_project_code_uq").on(t.projectId, t.loanCode),
    index("labour_loans_project_idx").on(t.projectId),
    check("labour_loans_amount_pos", sql`${t.amount} > 0`),
  ],
);

export const labourLoanRecoveries = pgTable(
  "labour_loan_recoveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => labourLoans.id, { onDelete: "cascade" }),
    recoveryDate: date("recovery_date").notNull(),
    amount: money("amount").notNull(),
    method: loanRecoveryMethodEnum("method").notNull(),
    /** Wage bill the deduction was made from (WAGE_DEDUCTION). */
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("labour_loan_recoveries_loan_idx").on(t.loanId), check("labour_loan_recoveries_pos", sql`${t.amount} > 0`)],
);

// ───────────────────────────── Relations ─────────────────────────────
export const customersRelations = relations(customers, ({ many }) => ({ projects: many(projects) }));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  items: many(quotationItems),
  invoices: many(invoices),
  payments: many(clientPayments),
  expenses: many(expenses),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one, many }) => ({
  project: one(projects, { fields: [quotationItems.projectId], references: [projects.id] }),
  expenses: many(expenses),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  payments: many(clientPayments),
}));

export const clientPaymentsRelations = relations(clientPayments, ({ one }) => ({
  project: one(projects, { fields: [clientPayments.projectId], references: [projects.id] }),
  invoice: one(invoices, { fields: [clientPayments.invoiceId], references: [invoices.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  item: one(quotationItems, { fields: [expenses.quotationItemId], references: [quotationItems.id] }),
  payments: many(expensePayments),
}));

export const expensePaymentsRelations = relations(expensePayments, ({ one }) => ({
  expense: one(expenses, { fields: [expensePayments.expenseId], references: [expenses.id] }),
}));

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ClientPayment = typeof clientPayments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpensePayment = typeof expensePayments.$inferSelect;
export type ExpenseType = typeof expenseTypes.$inferSelect;
export type LabourLoan = typeof labourLoans.$inferSelect;
export type LabourLoanRecovery = typeof labourLoanRecoveries.$inferSelect;
