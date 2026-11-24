"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/actions/auth";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  const params = useSearchParams();
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={params.get("callbackUrl") ?? "/dashboard"} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" variant="accent">
        Sign in
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
