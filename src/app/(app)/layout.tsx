import { Suspense } from "react";
import Link from "next/link";
import { HardHat, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";
import { SidebarLinks } from "@/components/nav";
import { requireUser } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/constants";
import { can } from "@/lib/rbac";

/** Static shell renders instantly; the session-dependent parts stream in behind Suspense. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar px-3 py-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-3 text-white">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent">
            <HardHat className="size-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Dananjaya</span>
            <span className="block text-xs text-sidebar-foreground">Construction · Fit-Out</span>
          </span>
        </Link>
        <Suspense fallback={<div className="px-3 text-xs text-sidebar-foreground">Loading…</div>}>
          <SidebarBody />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <MobileBar />
        </Suspense>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

async function linksFor() {
  const user = await requireUser();
  const links: { href: string; label: string; icon: "LayoutDashboard" | "FolderKanban" | "Users" | "UserCircle" }[] = [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/projects", label: "Projects", icon: "FolderKanban" },
  ];
  if (can(user.role, "manageUsers")) links.push({ href: "/users", label: "User Accounts", icon: "Users" });
  links.push({ href: "/account", label: "My Account", icon: "UserCircle" });
  return { user, links };
}

async function SidebarBody() {
  const { user, links } = await linksFor();
  return (
    <>
      <SidebarLinks links={links} />
      <div className="mt-auto border-t border-white/10 px-3 pt-4">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-sidebar-foreground">{ROLE_LABELS[user.role]}</p>
        <form action={logout}>
          <button className="mt-3 flex items-center gap-1.5 text-xs text-sidebar-foreground hover:text-white">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </div>
    </>
  );
}

async function MobileBar() {
  const { user, links } = await linksFor();
  return (
    <div className="flex items-center gap-3 overflow-x-auto bg-sidebar px-4 py-2 md:hidden">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm whitespace-nowrap text-sidebar-foreground hover:text-white">
          {l.label}
        </Link>
      ))}
      <span className="ml-auto truncate text-xs text-sidebar-foreground">{user.name}</span>
      <form action={logout}>
        <button className="text-sidebar-foreground hover:text-white" aria-label="Sign out">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
