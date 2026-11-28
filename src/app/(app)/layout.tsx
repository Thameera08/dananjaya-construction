import { Suspense } from "react";
import Link from "next/link";
import { HardHat, LogOut, Menu } from "lucide-react";
import { logout } from "@/actions/auth";
import { SidebarLinks } from "@/components/nav";
import { Drawer } from "@/components/ui/drawer";
import { requireUser, type CurrentUser } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/constants";
import { can } from "@/lib/rbac";

/** Static shell renders instantly; the session-dependent parts stream in behind Suspense. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar px-3 py-5 md:flex">
        <Brand />
        <Suspense fallback={<div className="px-3 text-xs text-sidebar-foreground">Loading…</div>}>
          <SidebarBody />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 bg-sidebar md:hidden" />}>
          <MobileBar />
        </Suspense>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="mb-7 flex items-center gap-2.5 px-3 text-white">
      <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-accent shadow-md shadow-black/30">
        <HardHat className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">Dananjaya</span>
        <span className="block text-[11px] text-sidebar-foreground">Construction · Fit-Out</span>
      </span>
    </Link>
  );
}

async function linksFor() {
  const user = await requireUser();
  const links: { href: string; label: string; icon: "LayoutDashboard" | "FolderKanban" | "Package" | "Users" | "UserCircle" }[] = [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/projects", label: "Projects", icon: "FolderKanban" },
    { href: "/inventory", label: "Inventory", icon: "Package" },
  ];
  if (can(user.role, "manageUsers")) links.push({ href: "/users", label: "User Accounts", icon: "Users" });
  links.push({ href: "/account", label: "My Account", icon: "UserCircle" });
  return { user, links };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function UserFooter({ user }: { user: CurrentUser }) {
  return (
    <div className="mt-auto rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">{initials(user.name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-[11px] text-sidebar-foreground">{ROLE_LABELS[user.role]}</p>
        </div>
      </div>
      <form action={logout}>
        <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-xs text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
}

async function SidebarBody() {
  const { user, links } = await linksFor();
  return (
    <>
      <SidebarLinks links={links} />
      <UserFooter user={user} />
    </>
  );
}

async function MobileBar() {
  const { user, links } = await linksFor();
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-3 md:hidden">
      <Drawer
        side="left"
        trigger={<Menu className="size-5" />}
        triggerVariant="ghost"
        triggerSize="icon"
        triggerClassName="text-white hover:bg-white/10"
        triggerLabel="Open menu"
      >
        <div className="flex h-full flex-col px-3 py-5">
          <Brand />
          <SidebarLinks links={links} />
          <UserFooter user={user} />
        </div>
      </Drawer>
      <Link href="/dashboard" className="text-sm font-semibold text-white">
        Dananjaya Construction
      </Link>
      <span className="ml-auto flex size-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{initials(user.name)}</span>
    </div>
  );
}
