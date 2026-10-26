import { plannedWeight, rollingAverage, type BodyGoal, type Race, type WeighIn } from "@/lib/cut";

const DAY = 86400_000;

/** Planned line (dashed) vs your 7-day average weight, with races marked. Server-rendered SVG. */
export default function WeightPlanChart({ goal, goalWeight, weighIns, races, today }: { goal: BodyGoal; goalWeight: number; weighIns: WeighIn[]; races: Race[]; today: string }) {
  const W = 326;
  const H = 130;
  const pad = { l: 30, r: 8, t: 8, b: 18 };
  const start = Date.parse(goal.start_date);
  const end = Math.max(Date.parse(goal.target_date), Date.parse(today));
  const x = (d: string) => pad.l + ((Date.parse(d) - start) / Math.max(DAY, end - start)) * (W - pad.l - pad.r);

  const inRange = weighIns.filter((w) => w.date >= goal.start_date && w.date <= today);
  const avg = [...new Set(inRange.map((w) => w.date))].map((d) => ({ date: d, v: rollingAverage(weighIns, d)! }));
  const vals = [goal.start_weight, goalWeight, ...avg.map((a) => a.v), ...inRange.map((w) => w.weight_kg)];
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Weight plan from ${goal.start_weight} kg to ${goalWeight} kg by ${fmt(goal.target_date)}, with your 7-day average`}>
      {[hi, (hi + lo) / 2, lo].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
          <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">{Math.round(v * 10) / 10}</text>
        </g>
      ))}
      {races
        .filter((r) => r.date >= goal.start_date && Date.parse(r.date) <= end)
        .map((r) => (
          <g key={r.date + r.name}>
            <line x1={x(r.date)} x2={x(r.date)} y1={pad.t} y2={H - pad.b} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="2 3" />
            <text x={x(r.date)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--accent)">{r.name.replace(/^hyrox\s*/i, "").slice(0, 10)}</text>
          </g>
        ))}
      <line x1={x(goal.start_date)} y1={y(goal.start_weight)} x2={x(goal.target_date)} y2={y(plannedWeight(goal, goal.target_date))} stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" />
      {inRange.map((w) => (
        <circle key={w.date} cx={x(w.date)} cy={y(w.weight_kg)} r={2} fill="var(--c-run)" opacity={0.35} />
      ))}
      {avg.length > 1 && <polyline fill="none" stroke="var(--c-run)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={avg.map((a) => `${x(a.date)},${y(a.v)}`).join(" ")} />}
      {avg.length > 0 && <circle cx={x(avg[avg.length - 1].date)} cy={y(avg[avg.length - 1].v)} r={4} fill="var(--c-run)" />}
      <text x={pad.l} y={H - 6} fontSize={9} fill="var(--muted)">{fmt(goal.start_date)}</text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize={9} fill="var(--muted)">{fmt(goal.target_date)}</text>
    </svg>
  );
}
