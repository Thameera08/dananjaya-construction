import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "bad" | "warn" | "muted";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-xs",
        tone === "good" && "border-l-4 border-l-success",
        tone === "bad" && "border-l-4 border-l-danger",
        tone === "warn" && "border-l-4 border-l-accent",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {icon ? <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className={cn("mt-2 text-xl font-semibold tabular-nums tracking-tight", tone === "muted" && "text-base font-medium text-muted-foreground")}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function KpiGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
