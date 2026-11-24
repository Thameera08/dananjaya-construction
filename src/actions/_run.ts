import "server-only";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthzError } from "@/lib/dal";
import type { ActionState } from "@/lib/validation";

export class UserError extends Error {}

function pgCode(e: unknown): { code?: string; constraint?: string } {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const o = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code)) {
      return { code: o.code, constraint: typeof o.constraint === "string" ? o.constraint : undefined };
    }
    cur = o.cause;
  }
  return {};
}

export const isUniqueViolation = (e: unknown) => pgCode(e).code === "23505";
/** Name of the violated unique constraint, if any. */
export const uniqueConstraint = (e: unknown) => (pgCode(e).code === "23505" ? (pgCode(e).constraint ?? "") : null);

/** Runs an action body and converts expected failures into ActionState errors. */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof AuthzError || e instanceof UserError) return { error: e.message };
    const { code, constraint } = pgCode(e);
    if (code === "23505") return { error: "A record with that code / number already exists." };
    if (code === "23503") return { error: "This record is referenced by other records and can't be removed." };
    if (code === "23514") {
      if (constraint?.includes("paid_within_total")) return { error: "Paid to date cannot exceed the total incurred cost." };
      return { error: "The values entered break a financial rule (e.g. negative or out-of-range amount)." };
    }
    console.error("[action]", e);
    return { error: "Something went wrong. Please try again." };
  }
}

/** Retry an insert that allocates a sequential code (RC-001…) if a concurrent insert took it. */
export async function withCodeRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isUniqueViolation(e) || i >= attempts - 1) throw e;
    }
  }
}

export function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
}
