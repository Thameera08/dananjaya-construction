import { BarChart3, FileText, HardHat, ShieldCheck, Wallet } from "lucide-react";

const POINTS = [
  { icon: FileText, text: "Categorised BOQ quotations with PDF export" },
  { icon: Wallet, text: "Receipts, supplier bills and payables in one ledger" },
  { icon: BarChart3, text: "Live section P&L that reconciles to the rupee" },
  { icon: ShieldCheck, text: "Role-based access for owners, QS and cashiers" },
];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-info/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-accent shadow-lg shadow-black/30">
            <HardHat className="size-6" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Dananjaya Construction</p>
            <p className="text-xs text-sidebar-foreground">Construction & Interior Fit-Out</p>
          </div>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Every rupee on every site, accounted for.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-sm text-sidebar-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-accent">
                  <p.icon className="size-4" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-sidebar-foreground/70">LKR · Quotation → Budget → Invoices → P&L</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
              <HardHat className="size-5" />
            </span>
            <span className="font-semibold">Dananjaya Construction</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
