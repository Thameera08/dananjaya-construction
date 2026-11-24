import { Suspense } from "react";
import { deleteProject, updateProject } from "@/actions/projects";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Callout, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { requireUser } from "@/lib/dal";
import { requireProjectData } from "@/lib/queries";
import { can } from "@/lib/rbac";

export const metadata = { title: "Project settings" };

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { project: p, customer: c } = await requireProjectData(id);
  const canEdit = can(user.role, "editProject");
  const locked = p.status !== "DRAFT";

  return (
    <div className="max-w-4xl space-y-6">
      {!canEdit && <Callout tone="info">Your role can view these settings but not change them.</Callout>}
      <ActionForm action={updateProject.bind(null, id)} keepValues className="space-y-6">
        <fieldset disabled={!canEdit} className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Project & quotation</CardTitle>
                {locked && <CardDescription>Quotation number, discount and advance % are locked while the quotation is {p.status}.</CardDescription>}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Project title" className="md:col-span-2">
                <Input name="title" defaultValue={p.title} required />
              </Field>
              <Field label="Project code">
                <Input value={p.projectCode} disabled readOnly />
              </Field>
              <Field label="Site address" className="md:col-span-3">
                <Input name="siteAddress" defaultValue={p.siteAddress ?? ""} />
              </Field>
              <Field label="Quotation number">
                <Input name="quotationNumber" defaultValue={p.quotationNumber} required readOnly={locked} />
              </Field>
              <Field label="Quotation date">
                <Input type="date" name="quotationDate" defaultValue={p.quotationDate} required />
              </Field>
              <Field label="Valid until">
                <Input type="date" name="validUntil" defaultValue={p.validUntil ?? ""} />
              </Field>
              <Field label="Discount (%)">
                <Input name="discountPercent" defaultValue={p.discountPercent} required readOnly={locked} />
              </Field>
              <Field label="Advance (%)">
                <Input name="advancePercent" defaultValue={p.advancePercent} required readOnly={locked} />
              </Field>
              <Field label="Currency">
                <Input value={p.currency} disabled readOnly />
              </Field>
              <Field label="Scope exclusions" className="md:col-span-3">
                <Textarea name="exclusionsNotes" defaultValue={p.exclusionsNotes ?? ""} />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Customer · {c.name}</CardTitle>
                <CardDescription>Customer ID {c.customerCode}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Contact person">
                <Input name="contactPerson" defaultValue={c.contactPerson ?? ""} />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={c.phone ?? ""} />
              </Field>
              <Field label="Email">
                <Input name="customerEmail" type="email" defaultValue={c.email ?? ""} />
              </Field>
              <Field label="Billing address">
                <Input name="customerAddress" defaultValue={c.address ?? ""} />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bank details on quotations & invoices</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Bank name">
                <Input name="bankName" defaultValue={p.bankName ?? ""} />
              </Field>
              <Field label="Account number">
                <Input name="bankAccountNo" defaultValue={p.bankAccountNo ?? ""} />
              </Field>
              <Field label="Account holder name">
                <Input name="bankAccountName" defaultValue={p.bankAccountName ?? ""} />
              </Field>
            </CardContent>
          </Card>
          {canEdit && <SubmitButton variant="accent">Save settings</SubmitButton>}
        </fieldset>
      </ActionForm>

      {can(user.role, "deleteFinancialRecords") && (
        <Card className="border-danger/40">
          <CardHeader>
            <div>
              <CardTitle className="text-danger">Delete project</CardTitle>
              <CardDescription>Only possible when no receipts or expenses are recorded.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={deleteProject.bind(null, id)} className="flex flex-wrap items-end gap-3">
              <Field label={`Type ${p.projectCode} to confirm`}>
                <Input name="confirm" autoComplete="off" className="w-40" />
              </Field>
              <SubmitButton variant="danger">Delete project</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
