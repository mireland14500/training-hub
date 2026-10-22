import { MetricSpark } from "@/components/Charts";
import { formatDuration, formatPace } from "@/lib/analysis";
import { progressData, type MetricTrend } from "@/lib/data";

export const dynamic = "force-dynamic";

const TONE = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", muted: "var(--muted)" };

function fmtValue(m: MetricTrend, v: number | null) {
  if (v === null) return "–";
  if (m.format === "time") return formatDuration(v);
  if (m.format === "pace") return formatPace(v);
  return String(v);
}

function Change({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-muted">{label}: –</span>;
  const tone = value > 1 ? "var(--good)" : value < -1 ? "var(--bad)" : "var(--muted)";
  const arrow = value > 1 ? "▲" : value < -1 ? "▼" : "▬";
  return (
    <span className="tabular text-xs" style={{ color: tone }}>
      {arrow} {Math.abs(value)}% <span className="text-muted">{label}</span>
    </span>
  );
}

export default async function Progress() {
  const d = await progressData();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Progress</h1>

      <div className="card">
        <div className="label">Am I getting fitter?</div>
        <div className="mt-1 text-2xl font-bold" style={{ color: TONE[d.verdict.tone] }}>{d.verdict.label}</div>
        <p className="mt-1 text-sm text-muted">{d.verdict.text}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {d.metrics.map((m) => (
          <div key={m.key} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="label">{m.name}</div>
                <div className="tabular mt-1 text-2xl font-bold">
                  {fmtValue(m, m.now)}
                  {m.unit && <span className="text-sm font-normal text-muted"> {m.unit}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 pt-1">
                <Change value={m.change6w} label="6 wk" />
                <Change value={m.change12w} label="12 wk" />
              </div>
            </div>
            <MetricSpark data={m.points} format={m.format} lowerIsBetter={m.lowerIsBetter} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="label mb-1">Station benchmarks (scaled to race standard)</div>
        {d.stations.length === 0 ? (
          <p className="text-sm text-muted">Log timed station efforts to see them improve here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="text-left font-normal">Station</th><th className="text-right font-normal">First</th><th className="text-right font-normal">Latest</th><th className="text-right font-normal">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.stations.map((s) => {
                const diff = s.first && s.latest ? s.first.time - s.latest.time : 0;
                return (
                  <tr key={s.key}>
                    <td className="py-2">{s.name.replace(/ \d.*$/, "")}</td>
                    <td className="tabular py-2 text-right text-muted">{s.first ? formatDuration(s.first.time) : "–"}</td>
                    <td className="tabular py-2 text-right font-semibold">{s.latest ? formatDuration(s.latest.time) : "–"}</td>
                    <td className="tabular py-2 text-right" style={{ color: diff > 0 ? "var(--good)" : diff < 0 ? "var(--bad)" : "var(--muted)" }}>
                      {s.history.length > 1 ? `${diff >= 0 ? "−" : "+"}${formatDuration(Math.abs(diff))}` : "first"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted">
        Each marker is recalculated every 2 weeks using only the data available up to that date (90-day window), so the trend shows real change, not just more logging.
      </p>
    </div>
  );
}
