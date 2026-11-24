"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  UserCircle,
  FileText,
  Calculator,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { LayoutDashboard, FolderKanban, Users, UserCircle };

export function SidebarLinks({ links }: { links: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((l) => {
        const Icon = ICONS[l.icon];
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-white/10 font-medium text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="size-4" /> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

const TABS = [
  { seg: "", label: "Overview", icon: Gauge },
  { seg: "quotation", label: "Quotation", icon: FileText },
  { seg: "budget", label: "Cost Budget", icon: Calculator },
  { seg: "invoices", label: "Invoices & Receipts", icon: Receipt },
  { seg: "expenses", label: "Expenses", icon: Wallet },
  { seg: "pnl", label: "Section P&L", icon: BarChart3 },
  { seg: "settings", label: "Settings", icon: Settings },
];

export function ProjectTabs() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/projects/${id}`;
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Project sections">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.seg}
            href={href}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active ? "border-accent font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
