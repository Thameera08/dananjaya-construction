import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, type UserRole } from "@/db/schema";
import { can, type Permission } from "./rbac";

export type CurrentUser = { id: string; name: string; email: string; role: UserRole };

/**
 * Data Access Layer: resolves the session AND re-reads the user from the DB, so role
 * changes and deactivations take effect immediately (JWTs alone would linger for 12h).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id));
  if (!u || !u.isActive) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
});

/** For pages: redirect to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect to /dashboard when the role lacks the permission. */
export async function requirePermissionPage(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

export class AuthzError extends Error {}

/** For Server Actions / Route Handlers: throw instead of redirecting. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthzError("Your session has expired. Please sign in again.");
  if (permission && !can(user.role, permission)) {
    throw new AuthzError("You don't have permission to perform this action.");
  }
  return user;
}
