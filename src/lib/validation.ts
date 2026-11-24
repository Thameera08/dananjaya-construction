import { z } from "zod";
import { parseMoneyInput } from "./money";

const trimmed = (max = 500) => z.string().trim().max(max);
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 500) => trimmed(max).min(1, `${label} is required`);

export const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`);
export const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date");

/** Money string → canonical "1234.50" (non-negative). */
export const moneyField = (label: string) =>
  z.string().transform((v, ctx) => {
    const m = parseMoneyInput(v);
    if (m === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be a valid amount (max 2 decimals)` });
      return z.NEVER;
    }
    return m;
  });

export const positiveMoney = (label: string) =>
  moneyField(label).refine((v) => Number(v) > 0, `${label} must be greater than zero`);

/** Blank → null (e.g. "not yet estimated"). */
export const optionalMoney = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return null;
      const m = parseMoneyInput(v);
      if (m === null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount` });
        return z.NEVER;
      }
      return m;
    });

export const percentField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimals`)
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, `${label} must be between 0 and 100`);

export const quantityField = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d{1,11}(\.\d{1,3})?$/, "Quantity must be a number (max 3 decimals)"));

export const blobUrlField = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || /^https:\/\/[a-z0-9-]+\.(private\.|public\.)?blob\.vercel-storage\.com\//i.test(v),
    "Invalid attachment",
  );

export const passwordField = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password is too long");

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function fromZod(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: Object.values(fieldErrors)[0] ?? "Invalid input", fieldErrors };
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
