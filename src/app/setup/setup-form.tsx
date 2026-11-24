"use client";

import { useActionState } from "react";
import { setupFirstAdmin } from "@/actions/auth";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";

export function SetupForm() {
  const [state, action] = useActionState(setupFirstAdmin, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name" htmlFor="name" hint={fe.name}>
        <Input id="name" name="name" required autoFocus />
      </Field>
      <Field label="Email" htmlFor="email" hint={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={fe.password ?? "At least 10 characters"}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" hint={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" variant="accent">
        Create admin account
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
