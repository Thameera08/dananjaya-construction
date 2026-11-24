# Dananjaya Construction — Fit-Out Management System

Quotations, cost budgets, invoicing, client receipts, expense ledger and project P&L for
construction & interior fit-out contractors in Sri Lanka (LKR). Next.js 16 (App Router) ·
Neon Postgres + Drizzle · Auth.js v5 · Vercel Blob · pdf-lib · ExcelJS · Recharts.

## Roles

| Role | Can do |
| --- | --- |
| **ADMIN** (Owner / PM) | Everything: user accounts, quotation approval, deletions/reversals |
| **ESTIMATOR** (QS) | Create projects, edit BOQ quotation, cost budget. Read-only finance |
| **ACCOUNTANT** (Site Cashier) | Invoices, client receipts, expense ledger, file uploads. Read-only BOQ |

Admins manage staff at **/users** (create, change role, reset password, deactivate —
deactivation takes effect on the next request). Everyone can change their own password at **/account**.
The last active admin can't be demoted or deactivated.

## Getting the admin account

Pick one:

1. **First-run setup page** — on an empty database, `/login` links to `/setup`, which creates the
   first ADMIN. It is disabled permanently once any account exists.
2. **CLI (production)** — `npm run create-admin -- --email owner@company.lk --name "Owner"`
   (prints a generated password, or pass `--password`). Also promotes/re-activates an existing email.
3. **Seed (demo)** — `npm run db:seed` creates `admin@dananjaya.lk` (ADMIN) plus
   `estimator@dananjaya.lk` and `accountant@dananjaya.lk`, and the Gameon World sample project.
   Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD`, otherwise random ones are
   printed once. Flags: `--no-demo-users`, `--reset` (recreate project), `--reset-passwords`.

## Setup

```bash
npm install
vercel link && vercel env pull .env.local   # or copy .env.example → .env.local
npx auth secret                               # sets AUTH_SECRET
npm run db:push                               # create tables in Neon
npm run db:seed                               # optional sample data + accounts
npm run dev
```

On Vercel: add the **Neon** integration (provides `DATABASE_URL` / `DATABASE_URL_UNPOOLED`), connect a
**private Blob store** (`BLOB_READ_WRITE_TOKEN`), and set `AUTH_SECRET`. The `build` script runs
`drizzle-kit push && next build`, so every preview/production deployment syncs the schema to its Neon
branch. `drizzle-kit push` stops on ambiguous/destructive changes (column renames, drops) — run those
by hand first. `npm run build:app` builds without touching the database.

## Financial rules worth knowing

- All money is `NUMERIC(15,2)` and computed with decimal.js (half-up to cents) — no floats.
  Every figure (pages, PDFs, Excel) comes from `src/lib/finance.ts`.
- Quotation `DRAFT → SENT → APPROVED`. BOQ, discount and advance % lock once sent; approval
  (Admin only) opens the cost budget. Admin can re-open for revision.
- Expected gross profit/margin stay **locked** until every active BOQ item has a planned cost
  (blank = not estimated; `0` is a valid estimate).
- Expenses: record the full bill once, then log part-payments against the same EX-code. Payments
  can't exceed the bill (atomic SQL + DB CHECK constraint), and duplicate bill refs are rejected.
- Section P&L adds an automatic “Unallocated / Site Overheads” row so it reconciles 100% with the
  dashboard.
- Uploaded slips/bills go to a **private** Blob store and are only served through `/api/files`
  to signed-in users.

## Exports

- `GET /api/projects/:id/quotation-pdf`
- `GET /api/projects/:id/invoice-pdf?invoiceId=…`
- `GET /api/projects/:id/pnl-excel` — 7-sheet workbook (Summary, Section P&L, BOQ, Cost Budget,
  Expense Ledger, Client Receipts, Invoices)

Letterhead: `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_PHONE`, `COMPANY_EMAIL`.
# dananjaya-construction
