import { Suspense } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { createUser, resetUserPassword, setUserActive, updateUserRole } from "@/actions/users";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { userRoleEnum } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/constants";
import { requirePermissionPage } from "@/lib/dal";
import { listUsers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "User Accounts" };

const ROLE_HELP = {
  ADMIN: "Full access: users, approvals, deletions, all modules.",
  ESTIMATOR: "Projects, quotation BOQ and cost budget. Read-only finance.",
  ACCOUNTANT: "Invoices, client receipts and expense ledger. Read-only BOQ.",
};

export default function UsersPage() {
  return (
    <>
      <PageHeader title="User Accounts" description="Create staff accounts and control what each role can do." />
      <Suspense fallback={<PageSkeleton />}>
        <UsersContent />
      </Suspense>
    </>
  );
}

async function UsersContent() {
  const me = await requirePermissionPage("manageUsers");
  const list = await listUsers();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>{list.length} account(s). Deactivated users lose access immediately.</CardDescription>
          </div>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {list.map((u) => (
              <TR key={u.id} className={u.isActive ? "" : "opacity-60"}>
                <TD>
                  <p className="font-medium">
                    {u.name} {u.id === me.id && <Badge tone="dark">You</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TD>
                <TD>
                  <ActionForm action={updateUserRole.bind(null, u.id)} className="flex items-center gap-1.5" compact keepValues>
                    <Select name="role" defaultValue={u.role} className="h-8 w-52 text-xs" aria-label={`Role for ${u.email}`}>
                      {userRoleEnum.enumValues.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="xs" variant="outline">
                      Save
                    </SubmitButton>
                  </ActionForm>
                </TD>
                <TD>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>}</TD>
                <TD className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <details className="relative">
                      <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs hover:bg-muted">
                        <KeyRound className="size-3.5" /> Reset password
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-72 rounded-md border border-border bg-card p-3 shadow-lg">
                        <ActionForm action={resetUserPassword.bind(null, u.id)}>
                          <Field label={`New password for ${u.name}`}>
                            <Input name="password" type="text" minLength={10} required autoComplete="off" />
                          </Field>
                          <SubmitButton size="sm" className="mt-2 w-full">
                            Set password
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                    {u.id !== me.id && (
                      <ActionForm
                        action={setUserActive.bind(null, u.id, !u.isActive)}
                        compact
                        confirm={u.isActive ? `Deactivate ${u.email}? They will be signed out immediately.` : undefined}
                      >
                        <SubmitButton size="xs" variant={u.isActive ? "danger-ghost" : "outline"}>
                          {u.isActive ? "Deactivate" : "Activate"}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4" /> New account
              </CardTitle>
              <CardDescription>Give the user a temporary password; they can change it under My Account.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={createUser} className="space-y-3">
              <Field label="Full name">
                <Input name="name" required />
              </Field>
              <Field label="Email (login)">
                <Input name="email" type="email" required autoComplete="off" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="ACCOUNTANT">
                  {userRoleEnum.enumValues.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Temporary password" hint="At least 10 characters">
                <Input name="password" type="text" minLength={10} required autoComplete="off" />
              </Field>
              <SubmitButton variant="accent" className="w-full">
                Create account
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Role permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {userRoleEnum.enumValues.map((r) => (
              <div key={r}>
                <p className="font-medium">{ROLE_LABELS[r]}</p>
                <p className="text-muted-foreground">{ROLE_HELP[r]}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
