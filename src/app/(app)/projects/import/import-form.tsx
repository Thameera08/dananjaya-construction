"use client";

import { useActionState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { previewImport, runImport, type ImportState } from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const rs = (v: string) =>
  `Rs. ${Number(v).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Pending state comes from each useActionState: useFormStatus is unreliable when one
// form has two buttons with different formActions.
function Submit({ children, variant, formAction, disabled, pending }: { children: React.ReactNode; variant: "outline" | "accent"; formAction: (fd: FormData) => void; disabled?: boolean; pending: boolean }) {
  return (
    <Button type="submit" variant={variant} formAction={formAction} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function ImportForm({ canReplace }: { canReplace: boolean }) {
  const [preview, previewAction, previewing] = useActionState(previewImport, {} as ImportState);
  const [result, importAction, importing] = useActionState(runImport, {} as ImportState);
  const busy = previewing || importing;
  const p = preview.preview;
  const blocked = !p || p.errors.length > 0;

  return (
    // Keep the chosen file between "Check" and "Import" (React resets forms after an action).
    <form className="space-y-6" onReset={(e) => e.preventDefault()}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Project workbook (.xlsx)" className="md:col-span-3" hint="Use the Project Profit & Loss Tracker layout: Quotation Items, Project Setup, Cost Budget, Client Payments, Expense Ledger.">
          <Input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="h-auto py-1.5" />
        </Field>
        <Field label="Customer name" hint="The sheet only has the Customer ID. Leave blank to use the project title.">
          <Input name="customerName" placeholder="e.g. Gameon World (Pvt) Ltd" />
        </Field>
        <Field label="Quotation status after import">
          <Select name="status" defaultValue="APPROVED">
            <option value="APPROVED">APPROVED (opens cost budget)</option>
            <option value="SENT">SENT</option>
            <option value="DRAFT">DRAFT</option>
          </Select>
        </Field>
        {canReplace && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="replace" className="size-4" />
            Replace existing project with the same code / quotation no.
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Submit variant="outline" formAction={previewAction} pending={previewing} disabled={busy}>
          <FileSpreadsheet /> Check workbook
        </Submit>
        <Submit variant="accent" formAction={importAction} pending={importing} disabled={blocked || busy}>
          <Upload /> Import project
        </Submit>
      </div>

      {(preview.error || result.error) && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {result.error ?? preview.error}
        </p>
      )}

      {p && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{p.project.title}</p>
              <p className="text-sm text-muted-foreground">
                Code {p.project.projectCode} · Quotation {p.project.quotationNumber} · Customer {p.project.customerCode || "(new)"}
                {p.customerExists ? " (existing customer)" : ""} · {p.project.quotationDate}
              </p>
            </div>
            {p.errors.length === 0 ? (
              <span className="flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="size-4" /> Ready to import</span>
            ) : (
              <span className="flex items-center gap-1 text-sm font-medium text-danger"><AlertCircle className="size-4" /> {p.errors.length} problem(s) to fix</span>
            )}
          </div>

          {p.conflict && (
            <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-[#78350f]">
              Already in the system: <strong>{p.conflict}</strong>.{" "}
              {canReplace ? 'Tick "Replace existing project" to overwrite it (its receipts and expenses will be replaced too).' : "Ask an Admin to replace it."}
            </p>
          )}

          <Table>
            <THead>
              <TR><TH>What will be imported</TH><TH className="text-right">Count</TH><TH className="text-right">Amount</TH></TR>
            </THead>
            <TBody>
              <TR><TD>BOQ items (gross quoted value)</TD><TD className="num">{p.items.length}</TD><TD className="num">{rs(p.totals.gross)}</TD></TR>
              <TR><TD>Discount ({p.project.discountPercent}%)</TD><TD /><TD className="num">-{rs(p.totals.discount)}</TD></TR>
              <TR className="font-semibold"><TD>Net contract value</TD><TD /><TD className="num">{rs(p.totals.net)}</TD></TR>
              <TR><TD>Advance required ({p.project.advancePercent}%)</TD><TD /><TD className="num">{rs(p.totals.advance)}</TD></TR>
              <TR><TD>Planned costs (cost budget)</TD><TD className="num">{p.totals.estimated} / {p.items.length}</TD><TD className="num">{rs(p.totals.planned)}</TD></TR>
              <TR><TD>Client receipts</TD><TD className="num">{p.payments.length}</TD><TD className="num">{rs(p.totals.received)}</TD></TR>
              <TR><TD>Expenses: incurred / paid</TD><TD className="num">{p.expenses.length}</TD><TD className="num">{rs(p.totals.incurred)} / {rs(p.totals.paid)}</TD></TR>
            </TBody>
          </Table>

          {p.errors.length > 0 && (
            <ul className="space-y-1 text-sm text-danger">
              {p.errors.map((e) => <li key={e} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-4 shrink-0" />{e}</li>)}
            </ul>
          )}
          {p.warnings.length > 0 && (
            <details open={p.warnings.length <= 4}>
              <summary className="cursor-pointer text-sm font-medium text-[#92400e]">{p.warnings.length} note(s): imported with adjustments</summary>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {p.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
