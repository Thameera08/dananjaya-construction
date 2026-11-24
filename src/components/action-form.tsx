"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/validation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Native confirm() prompt before submitting (destructive actions). */
  confirm?: string;
  /** Hide the inline success/error line (e.g. for compact row buttons). */
  compact?: boolean;
  /** Keep typed values after success (edit forms). Default: reset (create forms). */
  keepValues?: boolean;
};

export function ActionForm({ action, children, className, confirm, compact, keepValues }: Props) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (compact && state.error) window.alert(state.error);
  }, [state, compact]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      // React resets uncontrolled fields after a successful action; opt out for edit forms.
      onReset={keepValues ? (e) => e.preventDefault() : undefined}
    >
      {children}
      {!compact && <FormMessage state={state} />}
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="mt-3 flex items-start gap-1.5 text-sm text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.message}
      </p>
    );
  }
  return null;
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={cn(className)} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
