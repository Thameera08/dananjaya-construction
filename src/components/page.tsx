import { Inbox } from "lucide-react";

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

/** Shimmering placeholder shaped like a KPI row + table, shown while data streams in. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-6 w-36" />
            <div className="skeleton mt-3 h-1.5 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="skeleton h-4 w-48" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <p className="mt-3 font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Callout({ tone = "warn", title, children }: { tone?: "warn" | "info" | "danger"; title?: string; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-accent/30 bg-accent-soft/70 text-[#78350f] before:bg-accent"
      : tone === "danger"
        ? "border-danger/25 bg-danger-soft text-danger before:bg-danger"
        : "border-info/25 bg-info-soft/70 text-[#1e3a8a] before:bg-info";
  return (
    <div className={`relative overflow-hidden rounded-xl border py-3 pr-4 pl-5 text-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${cls}`} role="note">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
