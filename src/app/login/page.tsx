import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/dal";
import { AuthShell } from "@/components/auth-shell";
import { PageSkeleton } from "@/components/page";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" subtitle="Use the account your administrator created for you.">
      <Suspense fallback={<PageSkeleton />}>
        <LoginGate />
      </Suspense>
    </AuthShell>
  );
}

async function LoginGate() {
  if (await getCurrentUser()) redirect("/dashboard");
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p>No accounts exist yet. Create the first administrator account to get started.</p>
        <Link href="/setup" className="inline-flex h-9 w-full items-center justify-center rounded-md bg-accent px-4 font-medium text-white">
          Set up admin account
        </Link>
      </div>
    );
  }
  return <LoginForm />;
}
