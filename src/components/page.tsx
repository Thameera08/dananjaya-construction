import { Loader2 } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground" aria-busy="true">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Callout({ tone = "warn", title, children }: { tone?: "warn" | "info" | "danger"; title?: string; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-accent/40 bg-accent-soft text-[#78350f]"
      : tone === "danger"
        ? "border-danger/30 bg-danger-soft text-danger"
        : "border-info/30 bg-info-soft text-info";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`} role="note">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
