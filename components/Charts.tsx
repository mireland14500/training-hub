"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;
const tooltipStyle = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "var(--muted)" },
};

function pace(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function PmcChart({ data }: { data: { date: string; ctl: number; atl: number; tsb: number; load: number }[] }) {
  const d = data.map((p) => ({ ...p, date: p.date.slice(5) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={d} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={28} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="var(--muted)" />
        <Bar dataKey="load" name="Daily load" fill="var(--c-other)" opacity={0.35} />
        <Area dataKey="tsb" name="Form" stroke="var(--c-tsb)" fill="var(--c-tsb)" fillOpacity={0.15} strokeWidth={1.5} />
        <Line dataKey="ctl" name="Fitness" stroke="var(--c-ctl)" dot={false} strokeWidth={2} />
        <Line dataKey="atl" name="Fatigue" stroke="var(--c-atl)" dot={false} strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function WeeklyLoadChart({ data }: { data: Record<string, number | string>[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--border)", opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Run" stackId="a" fill="var(--c-run)" />
        <Bar dataKey="SkiErg" stackId="a" fill="var(--c-ski)" />
        <Bar dataKey="Ride" stackId="a" fill="var(--c-ride)" />
        <Bar dataKey="Other" stackId="a" fill="var(--c-other)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WellnessChart({ data }: { data: { date: string; hrv: number | null; rhr: number | null; sleep: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={24} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="hrv" name="HRV (ms)" stroke="var(--c-ski)" strokeWidth={2} connectNulls dot={false} />
        <Line dataKey="rhr" name="Resting HR" stroke="var(--c-atl)" strokeWidth={2} connectNulls dot={false} />
        <Line dataKey="sleep" name="Sleep score" stroke="var(--c-ctl)" strokeWidth={2} connectNulls dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ThresholdTrendChart({ data }: { data: { date: string; pace: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={24} />
        <YAxis {...axis} reversed domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={pace} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${pace(Number(v))} /km`, "Threshold"]} />
        <Line dataKey="pace" stroke="var(--c-run)" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeeklyKmChart({ data }: { data: { week: string; km: number; longest: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--border)", opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="km" name="Weekly km" fill="var(--c-run)" radius={[4, 4, 0, 0]} />
        <Line dataKey="longest" name="Long run km" stroke="var(--c-atl)" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function EfficiencyChart({ data }: { data: { date: string; ef: number }[] }) {
  const d = data.map((p) => ({ x: Date.parse(p.date), y: p.ef }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ScatterChart margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} {...axis} tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)} />
        <YAxis dataKey="y" {...axis} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => (n === "x" ? new Date(Number(v)).toISOString().slice(0, 10) : v)} />
        <Scatter data={d} fill="var(--c-run)" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function SkiTrendChart({ data }: { data: { date: string; pace500: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={24} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...axis} reversed domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={pace} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${pace(Number(v))} /500m`, "Avg pace"]} />
        <Line dataKey="pace500" stroke="var(--c-ski)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
