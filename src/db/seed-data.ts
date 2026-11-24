/**
 * Gameon World Office Renovation — Quotation #0004 dataset.
 * Kept free of `server-only` / Neon imports so it can run against any Postgres driver.
 */
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { hash } from "bcryptjs";
import * as schema from "./schema";
import { lineValue, percentOf, toDb } from "../lib/money";

type AnyDB = PgDatabase<PgQueryResultHKT, typeof schema>;

/** [category, description, unit, qty, rate, plannedCost | null] */
type Row = [string, string, string, string, string, string | null];

export const GAMEON_BOQ: Row[] = [
  // Painting Walls — 550,350.00
  ["Painting Walls", "Wall surface preparation: scraping, crack filling & sanding", "sq. ft.", "4200", "18.00", "48300.00"],
  ["Painting Walls", "One coat alkali-resistant wall sealer / primer", "sq. ft.", "4200", "22.00", "58800.00"],
  ["Painting Walls", "Two coats premium interior emulsion paint", "sq. ft.", "4200", "48.00", "134400.00"],
  ["Painting Walls", "Ceiling painting: two coats ceiling white", "sq. ft.", "2850", "35.00", "62700.00"],
  ["Painting Walls", "Enamel paint on door frames & skirting", "m", "180", "450.00", "50400.00"],
  // Electrical Works — 802,200.00
  ["Electrical Works", "Supply & install 2x2 ft 48W LED panel lights", "pcs", "36", "8500.00", "216000.00"],
  ["Electrical Works", "New 13A socket outlet points incl. wiring & PVC conduit", "points", "24", "6800.00", "112800.00"],
  ["Electrical Works", "Light point rewiring with 1.5 sq.mm cable", "points", "40", "3200.00", "84000.00"],
  ["Electrical Works", "Cat6 data / LAN points incl. faceplates & testing", "points", "16", "7500.00", "88000.00"],
  ["Electrical Works", "DB servicing, MCB replacement & earth testing", "lot", "1", "85000.00", "52000.00"],
  // Door Hardware & Repairs — 301,200.00
  ["Door Hardware & Repairs", "Replace mortise lock sets (stainless steel)", "set", "12", "9750.00", "78000.00"],
  ["Door Hardware & Repairs", "Supply & fix hydraulic door closers", "pcs", "8", "12500.00", "72000.00"],
  ["Door Hardware & Repairs", "Door hinge replacement & leaf re-alignment", "set", "14", "2800.00", "22400.00"],
  ["Door Hardware & Repairs", "Glass door patch fitting repair & floor spring service", "lot", "1", "45000.00", "28000.00"],
  // Chairman Room Repairing — 407,600.00
  ["Chairman Room Repairing", "Remove & replace damaged gypsum ceiling boards", "sq. ft.", "220", "380.00", "55000.00"],
  ["Chairman Room Repairing", "Timber wall panelling refurbishment with melamine finish", "sq. ft.", "180", "950.00", "117000.00"],
  ["Chairman Room Repairing", "Wooden floor repair: sanding & 3-coat lacquer", "sq. ft.", "320", "275.00", "57600.00"],
  ["Chairman Room Repairing", "Cove lighting with dimmer control", "lot", "1", "65000.00", "41000.00"],
  // Zebra Blinds — 335,060.00
  ["Zebra Blinds", "Supply & install zebra blinds: open office windows", "sq. ft.", "640", "420.00", "192000.00"],
  ["Zebra Blinds", "Zebra blinds with blackout fabric: chairman room", "sq. ft.", "96", "560.00", "38400.00"],
  ["Zebra Blinds", "Removal & disposal of existing vertical blinds", "lot", "1", "12500.00", "6000.00"],
  // Carpet & Vinyl — 886,700.00
  ["Carpet & Vinyl", "Commercial carpet tiles 50x50 cm incl. underlay & adhesive", "sq. ft.", "1850", "310.00", "407000.00"],
  ["Carpet & Vinyl", "3 mm LVT vinyl planks: pantry & corridor", "sq. ft.", "620", "285.00", "124000.00"],
  ["Carpet & Vinyl", "PVC skirting & transition strips", "m", "210", "650.00", "88200.00"],
  // Office Furniture — 199,715.00 (supplier quotes pending → not yet estimated)
  ["Office Furniture", "Ergonomic mesh office chairs with lumbar support", "pcs", "6", "18500.00", null],
  ["Office Furniture", "Meeting table repair & re-laminating", "lot", "1", "42500.00", null],
  ["Office Furniture", "Steel 4-drawer filing cabinets", "pcs", "3", "15405.00", null],
];

export type SeedUser = { name: string; email: string; role: schema.UserRole; password: string };

/** Create users if missing. Existing accounts keep their password unless resetPasswords is set. */
export async function seedUsers(db: AnyDB, list: SeedUser[], { resetPasswords = false } = {}) {
  const out: { email: string; role: string; created: boolean }[] = [];
  for (const u of list) {
    const email = u.email.trim().toLowerCase();
    const passwordHash = await hash(u.password, 12);
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!existing) {
      await db.insert(schema.users).values({ name: u.name, email, role: u.role, passwordHash });
      out.push({ email, role: u.role, created: true });
    } else {
      await db
        .update(schema.users)
        .set({ role: u.role, isActive: true, ...(resetPasswords ? { passwordHash } : {}) })
        .where(eq(schema.users.id, existing.id));
      out.push({ email, role: u.role, created: false });
    }
  }
  return out;
}

/** Insert the Gameon World project. Returns false if it already exists (unless reset). */
export async function seedGameonProject(db: AnyDB, { reset = false, createdBy }: { reset?: boolean; createdBy?: string }) {
  const [existing] = await db.select().from(schema.projects).where(eq(schema.projects.projectCode, "GW"));
  if (existing && !reset) return { created: false, projectId: existing.id };
  if (existing) {
    await db.delete(schema.projects).where(eq(schema.projects.id, existing.id)); // cascades children
  }

  let [customer] = await db.select().from(schema.customers).where(eq(schema.customers.customerCode, "00010"));
  if (!customer) {
    [customer] = await db
      .insert(schema.customers)
      .values({
        customerCode: "00010",
        name: "Gameon World (Pvt) Ltd",
        contactPerson: "Mr. Ruwan Perera",
        phone: "+94 77 123 4567",
        email: "accounts@gameonworld.example",
        address: "No. 45, Galle Road, Colombo 03",
      })
      .returning();
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      projectCode: "GW",
      customerId: customer.id,
      title: "Gameon World Office Renovation",
      siteAddress: "Level 4, No. 45, Galle Road, Colombo 03",
      currency: "LKR",
      status: "APPROVED",
      quotationNumber: "#0004",
      quotationDate: "2026-10-20",
      validUntil: "2026-11-19",
      discountPercent: "10.00",
      advancePercent: "75.00",
      bankName: "Commercial Bank of Ceylon PLC, Kollupitiya Branch",
      bankAccountNo: "8001234567",
      bankAccountName: "Dananjaya Construction (Pvt) Ltd",
      exclusionsNotes:
        "AC works: Not included - separate quotation pending.\nCivil / structural works, fire detection and building approvals are excluded.",
      approvedAt: new Date("2026-10-28T09:00:00+05:30"),
      budgetInitializedAt: new Date("2026-10-28T09:00:00+05:30"),
    })
    .returning();

  const itemRows = await db
    .insert(schema.quotationItems)
    .values(
      GAMEON_BOQ.map(([workCategory, description, unit, quantity, clientRate, plannedCost], i) => ({
        projectId: project.id,
        itemCode: `GW-${String(i + 1).padStart(3, "0")}`,
        workCategory,
        description,
        unit,
        quantity,
        clientRate,
        quotedValue: toDb(lineValue(quantity, clientRate)),
        plannedCost,
        costNotes: plannedCost === null ? "Awaiting supplier quotation" : null,
        sortOrder: (i + 1) * 10,
      })),
    )
    .returning();
  const code = (c: string) => itemRows.find((r) => r.itemCode === c)!.id;

  const gross = itemRows.reduce((a, r) => a.plus(r.quotedValue), lineValue(0, 0));
  const net = gross.minus(percentOf(gross, "10"));
  const advance = percentOf(net, "75");

  const [advInvoice] = await db
    .insert(schema.invoices)
    .values({
      projectId: project.id,
      invoiceNumber: "INV-0004-01",
      invoiceType: "ADVANCE",
      issueDate: "2026-10-28",
      dueDate: "2026-11-04",
      amount: toDb(advance),
      status: "PARTIAL",
      notes: "75% advance payable before project commencement.",
    })
    .returning();

  await db.insert(schema.clientPayments).values({
    projectId: project.id,
    invoiceId: advInvoice.id,
    receiptCode: "RC-001",
    paymentDate: "2026-11-02",
    paymentType: "ADVANCE",
    amount: "635000.00",
    paymentMethod: "BANK_TRANSFER",
    referenceNo: "TRF-20261102-0471",
    notes: "First advance instalment",
    createdBy,
  });

  const exp: Omit<typeof schema.expenses.$inferInsert, "projectId">[] = [
    {
      costCode: "EX-001", expenseDate: "2026-11-04", workCategory: "Painting Walls", quotationItemId: code("GW-003"),
      costType: "SUPPLIER", vendorDetails: "Colombo Paint Centre: emulsion, primer & sealer", invoiceRef: "CPC-55821",
      dueDate: "2026-12-04", totalCost: "148500.00", paidToDate: "100000.00", comments: "Balance on 30-day credit",
    },
    {
      costCode: "EX-002", expenseDate: "2026-11-05", workCategory: "Painting Walls", quotationItemId: code("GW-001"),
      costType: "LABOUR", vendorDetails: "Painting gang: week 1 (6 painters)", invoiceRef: "WK-01",
      totalCost: "96000.00", paidToDate: "96000.00",
    },
    {
      costCode: "EX-003", expenseDate: "2026-11-07", workCategory: "Electrical Works", quotationItemId: code("GW-006"),
      costType: "SUPPLIER", vendorDetails: "Lanka Electricals: 48W LED panels x 36", invoiceRef: "LE-2291",
      dueDate: "2026-12-07", totalCost: "198000.00", paidToDate: "0.00",
    },
    {
      costCode: "EX-004", expenseDate: "2026-11-08", workCategory: "Food", quotationItemId: null,
      costType: "OTHER", vendorDetails: "Site meals: labour team (week 1)", totalCost: "18750.00", paidToDate: "18750.00",
    },
    {
      costCode: "EX-005", expenseDate: "2026-11-10", workCategory: "Transport", quotationItemId: null,
      costType: "OTHER", vendorDetails: "Lorry hire: material delivery & debris removal", totalCost: "24000.00",
      paidToDate: "24000.00",
    },
    {
      costCode: "EX-006", expenseDate: "2026-11-12", workCategory: "Carpet & Vinyl", quotationItemId: code("GW-022"),
      costType: "SUBCONTRACTOR", vendorDetails: "Flooring subcontractor: mobilisation advance", invoiceRef: "FS-0193",
      dueDate: "2026-11-30", totalCost: "150000.00", paidToDate: "75000.00",
    },
  ];
  const expRows = await db
    .insert(schema.expenses)
    .values(exp.map((e) => ({ ...e, projectId: project.id, createdBy })))
    .returning();

  // Disbursement audit trail mirrors paid_to_date.
  const disb = expRows.filter((e) => Number(e.paidToDate) > 0);
  if (disb.length) {
    await db.insert(schema.expensePayments).values(
      disb.map((e) => ({
        expenseId: e.id,
        paymentDate: e.expenseDate,
        amount: e.paidToDate,
        paymentMethod: e.costType === "LABOUR" || e.costType === "OTHER" ? ("CASH" as const) : ("BANK_TRANSFER" as const),
        notes: "Opening balance (seed)",
        createdBy,
      })),
    );
  }

  return { created: true, projectId: project.id, gross: gross.toFixed(2), net: net.toFixed(2), advance: toDb(advance) };
}
