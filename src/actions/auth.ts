"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fromZod, passwordField, type ActionState } from "@/lib/validation";

/** Post-login redirect target: same-origin only (blocks open redirects such as "//evil.com"). */
async function safeCallback(raw: FormDataEntryValue | null) {
  const v = typeof raw === "string" ? raw : "";
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return v;
  try {
    // Auth.js supplies an absolute callbackUrl; accept it only if it points at this host.
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const u = new URL(v);
    if (host && u.host === host && (u.protocol === "https:" || u.protocol === "http:")) return `${u.pathname}${u.search}`;
  } catch {
    /* fall through */
  }
  return "/dashboard";
}

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirectTo: await safeCallback(fd.get("callbackUrl")),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: e.type === "CredentialsSignin" ? "Invalid email or password, or the account is disabled." : "Sign-in failed." };
    }
    throw e; // NEXT_REDIRECT on success
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

/**
 * First-run bootstrap: creates the initial ADMIN account. Only works while the users
 * table is empty — the INSERT … WHERE NOT EXISTS makes that check and the write atomic.
 */
export async function setupFirstAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fromZod(parsed.error);
  const { name, email, password } = parsed.data;
  const passwordHash = await hash(password, 12);
  const result = await db.execute(sql`
    INSERT INTO ${users} (name, email, password_hash, role)
    SELECT ${name}, ${email}, ${passwordHash}, 'ADMIN'
    WHERE NOT EXISTS (SELECT 1 FROM ${users})
    RETURNING id
  `);
  if (!result.rows.length) return { error: "Setup has already been completed. Please sign in." };
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }
  return { ok: true };
}
