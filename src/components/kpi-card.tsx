import { cn } from "@/lib/utils";

type Tone = "default" | "good" | "bad" | "warn" | "muted" | "info";

const CHIP: Record<Tone, string> = {
  default: "bg-muted text-foreground/70",
  good: "bg-success-soft text-success",
  bad: "bg-danger-soft text-danger",
  warn: "bg-accent-soft text-[#b45309]",
  muted: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
};
const BAR: Record<Tone, string> = {
  default: "bg-primary",
  good: "bg-success",
  bad: "bg-danger",
  warn: "bg-accent",
  muted: "bg-muted-foreground",
  info: "bg-info",
};

export function Progress({ value, tone = "default", className }: { value: number; tone?: Tone; className?: string }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", BAR[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
  progress,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  /** 0–100: renders a progress bar under the value. */
  progress?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon ? <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", CHIP[tone])}>{icon}</span> : null}
      </div>
      <div
        className={cn(
          "mt-1.5 text-[1.35rem] leading-tight font-semibold tracking-tight tabular-nums",
          tone === "muted" && "text-base font-medium text-muted-foreground",
          tone === "bad" && "text-danger",
        )}
      >
        {value}
      </div>
      {progress !== undefined ? <Progress value={progress} tone={tone === "muted" ? "default" : tone} className="mt-3" /> : null}
      {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function KpiGroup({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80 [&_svg]:size-4 [&_svg]:text-accent">
        {icon}
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
