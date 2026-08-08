import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonthShort, formatPace } from "@/lib/running";
import type { RunLog } from "@/components/student/running/types";

interface Props {
  runs: RunLog[];
}

type MonthPoint = { month: string; label: string; km: number; pace: number; days: number };

export function RunCharts({ runs }: Props) {
  const data = useMemo<MonthPoint[]>(() => {
    const map = new Map<string, { km: number; seconds: number; days: Set<string> }>();
    for (const run of runs) {
      const month = run.run_date.slice(0, 7);
      const entry = map.get(month) ?? { km: 0, seconds: 0, days: new Set<string>() };
      entry.km += Number(run.distance_km);
      entry.seconds += run.duration_seconds;
      entry.days.add(run.run_date);
      map.set(month, entry);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, v]) => ({
        month,
        label: formatMonthShort(month),
        km: Number(v.km.toFixed(1)),
        pace: v.km > 0 ? Math.round(v.seconds / v.km) : 0,
        days: v.days.size,
      }));
  }, [runs]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      <ChartCard title="Quilometragem mensal">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${v} km`, "Distância"]}
          />
          <Bar dataKey="km" fill="var(--primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Evolução do pace médio">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis
            reversed
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => formatPace(v)}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${formatPace(v)} /km`, "Pace médio"]} />
          <Line type="monotone" dataKey="pace" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Dias corridos por mês">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} dias`, "Frequência"]} />
          <Area type="monotone" dataKey="days" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ChartCard>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
};

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <section className="rounded-2xl bg-card p-4">
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
