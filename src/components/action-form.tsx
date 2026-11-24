"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/validation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useDrawer } from "@/components/ui/drawer";
import { useToast } from "@/components/toaster";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Native confirm() prompt before submitting (destructive actions). */
  confirm?: string;
  /** Row buttons: report errors as toasts instead of an inline line. */
  compact?: boolean;
  /** Keep typed values after success (edit forms). Default: reset (create forms). */
  keepValues?: boolean;
};

/**
 * Server Action form: success → toast (and closes the enclosing drawer),
 * errors → inline under the form (or a toast for compact row actions).
 */
export function ActionForm({ action, children, className, confirm, compact, keepValues }: Props) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const toast = useToast();
  const drawer = useDrawer();
  const seen = useRef<ActionState | null>(null);

  useEffect(() => {
    if (seen.current === state || (!state.ok && !state.error)) return;
    seen.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      drawer?.close();
    } else if (state.error && compact) {
      toast.error(state.error);
    }
  }, [state, compact, toast, drawer]);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      // React resets uncontrolled fields after a successful action; opt out for edit forms.
      onReset={keepValues ? (e) => e.preventDefault() : undefined}
    >
      {children}
      {!compact && <FormError state={state} />}
    </form>
  );
}

export function FormError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger md:col-span-full">
      <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
    </p>
  );
}

/** Kept for the login / setup forms that show both outcomes inline. */
export function FormMessage({ state }: { state: ActionState }) {
  return <FormError state={state} />;
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
