import { Suspense } from "react";
import { createProject } from "@/actions/projects";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { requirePermissionPage } from "@/lib/dal";
import { listCustomers } from "@/lib/queries";
import { addDays, todayLK } from "@/lib/utils";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="New project" description="Set up the client, quotation details and payment terms." />
      <Suspense fallback={<PageSkeleton />}>
        <NewProjectForm />
      </Suspense>
    </>
  );
}

async function NewProjectForm() {
  await requirePermissionPage("createProject");
  const customers = await listCustomers();
  const today = todayLK();
  const validUntil = addDays(today, 30);
  return (
    <ActionForm action={createProject} className="max-w-4xl space-y-6" keepValues>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Customer</CardTitle>
            <CardDescription>Choose an existing customer, or fill in the new-customer fields.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Existing customer" className="md:col-span-2">
            <Select name="customerId" defaultValue="">
              <option value="">— New customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerCode} · {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New customer name">
            <Input name="customerName" placeholder="e.g. Gameon World (Pvt) Ltd" />
          </Field>
          <Field label="Contact person">
            <Input name="contactPerson" />
          </Field>
          <Field label="Phone">
            <Input name="phone" placeholder="+94 7X XXX XXXX" />
          </Field>
          <Field label="Email">
            <Input name="customerEmail" type="email" />
          </Field>
          <Field label="Billing address" className="md:col-span-2">
            <Input name="customerAddress" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project & quotation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Project title" className="md:col-span-2">
            <Input name="title" required placeholder="e.g. Gameon World Office Renovation" />
          </Field>
          <Field label="Project code" hint="2–6 letters; BOQ IDs become CODE-001">
            <Input name="projectCode" required maxLength={6} placeholder="GW" className="uppercase" />
          </Field>
          <Field label="Site address" className="md:col-span-3">
            <Input name="siteAddress" />
          </Field>
          <Field label="Quotation number">
            <Input name="quotationNumber" required placeholder="#0004" />
          </Field>
          <Field label="Quotation date">
            <Input name="quotationDate" type="date" required defaultValue={today} />
          </Field>
          <Field label="Valid until">
            <Input name="validUntil" type="date" defaultValue={validUntil} />
          </Field>
          <Field label="Discount (%)">
            <Input name="discountPercent" inputMode="decimal" defaultValue="0" required />
          </Field>
          <Field label="Advance before commencement (%)">
            <Input name="advancePercent" inputMode="decimal" defaultValue="75" required />
          </Field>
          <Field label="Currency">
            <Input value="LKR (Rs.)" disabled readOnly />
          </Field>
          <Field label="Scope exclusions" className="md:col-span-3">
            <Textarea name="exclusionsNotes" placeholder="AC works: Not included - separate quotation pending" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Bank details (shown on quotations & invoices)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Bank name">
            <Input name="bankName" />
          </Field>
          <Field label="Account number">
            <Input name="bankAccountNo" />
          </Field>
          <Field label="Account holder name">
            <Input name="bankAccountName" />
          </Field>
        </CardContent>
      </Card>
      <SubmitButton variant="accent">Create project & open quotation</SubmitButton>
    </ActionForm>
  );
}
