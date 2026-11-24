"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
const fmtFull = (v: unknown) =>
  `Rs. ${Number(v).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type SeriesDef = { key: string; label: string; color: string };

export function MoneyBarChart({ data, series, xKey, height = 300 }: { data: Record<string, string | number>[]; series: SeriesDef[]; xKey: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#5d6573" }} interval={0} tickLine={false} axisLine={{ stroke: "#dfe3e8" }} height={50} angle={-15} textAnchor="end" />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#5d6573" }} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(v, name) => [fmtFull(v), name]} cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
