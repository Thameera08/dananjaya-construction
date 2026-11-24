import { Suspense } from "react";
import { changeOwnPassword } from "@/actions/users";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/dal";

export const metadata = { title: "My Account" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="My Account" />
      <Suspense fallback={<PageSkeleton />}>
        <AccountContent />
      </Suspense>
    </>
  );
}

async function AccountContent() {
  const user = await requireUser();
  return (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Role</p>
            <p className="font-medium">{ROLE_LABELS[user.role]}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={changeOwnPassword} className="space-y-3">
            <Field label="Current password">
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password" hint="At least 10 characters">
              <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Confirm new password">
              <Input name="confirm" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton className="w-full">Update password</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
