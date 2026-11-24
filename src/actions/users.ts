"use server";

import { hash, compare } from "bcryptjs";
import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { userRoleEnum, users } from "@/db/schema";
import { authorize } from "@/lib/dal";
import { fromZod, passwordField, type ActionState } from "@/lib/validation";
import { isUuid } from "@/lib/utils";
import { isUniqueViolation, run, UserError } from "./_run";

const roleField = z.enum(userRoleEnum.enumValues, { message: "Choose a role" });

async function activeAdminsExcluding(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), ne(users.id, userId)));
  return r?.n ?? 0;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: roleField,
  password: passwordField,
});

export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageUsers");
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const { name, email, role, password } = parsed.data;
    try {
      await db.insert(users).values({ name, email, role, passwordHash: await hash(password, 12) });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError("An account with that email already exists.");
      throw e;
    }
    revalidatePath("/users");
    return { ok: true, message: `Account created for ${email}. Share the temporary password securely.` };
  });
}

export async function updateUserRole(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await authorize("manageUsers");
    if (!isUuid(userId)) throw new UserError("Unknown user");
    const role = roleField.parse(fd.get("role"));
    if (userId === me.id && role !== "ADMIN") throw new UserError("You can't remove your own admin role.");
    if (role !== "ADMIN" && (await activeAdminsExcluding(userId)) === 0) {
      throw new UserError("At least one active admin account is required.");
    }
    await db.update(users).set({ role }).where(eq(users.id, userId));
    revalidatePath("/users");
    return { ok: true, message: "Role updated" };
  });
}

export async function setUserActive(userId: string, active: boolean, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await authorize("manageUsers");
    if (!isUuid(userId)) throw new UserError("Unknown user");
    if (!active && userId === me.id) throw new UserError("You can't deactivate your own account.");
    if (!active && (await activeAdminsExcluding(userId)) === 0) {
      const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
      if (u?.role === "ADMIN") throw new UserError("At least one active admin account is required.");
    }
    await db.update(users).set({ isActive: active }).where(eq(users.id, userId));
    revalidatePath("/users");
    return { ok: true, message: active ? "Account activated" : "Account deactivated — access revoked immediately" };
  });
}

export async function resetUserPassword(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorize("manageUsers");
    if (!isUuid(userId)) throw new UserError("Unknown user");
    const parsed = passwordField.safeParse(fd.get("password"));
    if (!parsed.success) return fromZod(parsed.error);
    await db.update(users).set({ passwordHash: await hash(parsed.data, 12) }).where(eq(users.id, userId));
    return { ok: true, message: "Password reset" };
  });
}

const changeOwnSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), password: passwordField, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function changeOwnPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await authorize();
    const parsed = changeOwnSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fromZod(parsed.error);
    const [u] = await db.select().from(users).where(eq(users.id, me.id));
    if (!u || !(await compare(parsed.data.current, u.passwordHash))) {
      return { error: "Current password is incorrect", fieldErrors: { current: "Incorrect password" } };
    }
    await db.update(users).set({ passwordHash: await hash(parsed.data.password, 12) }).where(eq(users.id, me.id));
    return { ok: true, message: "Password changed" };
  });
}
