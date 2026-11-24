import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "./setup-form";

export const metadata = { title: "First-time setup" };

/** One-time bootstrap of the first ADMIN. Disabled as soon as any user exists. */
export default function SetupPage() {
  return (
    <AuthShell title="Create the administrator account" subtitle="This page only works once, while no accounts exist.">
      <Suspense fallback={<FormSkeleton />}>
        <SetupGate />
      </Suspense>
    </AuthShell>
  );
}

async function SetupGate() {
  await connection(); // must check the live users table on every request, never at build time
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) redirect("/login");
  return <SetupForm />;
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-9 w-full" />
      <div className="skeleton h-9 w-full" />
      <div className="skeleton h-9 w-full" />
    </div>
  );
}
