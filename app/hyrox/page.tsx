import Link from "next/link";
import { HyroxTrendChart } from "@/components/Charts";
import { BenchmarkDelete } from "@/components/ActivityControls";
import { formatDuration } from "@/lib/analysis";
import { hyroxData, localDate } from "@/lib/data";
import { DIVISIONS, REFERENCE, STATION_BY_KEY, type Division, type Source } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

const SOURCE_STYLE: Record<Source, { label: string; color: string }> = {
  "race/sim": { label: "Your sim/race", color: "var(--good)" },
  benchmark: { label: "Your benchmark", color: "var(--good)" },
  "erg log": { label: "Your erg log", color: "var(--good)" },
  "running fitness": { label: "Your runs", color: "var(--good)" },
  reference: { label: "Typical — no data", color: "var(--warn)" },
};

export default async function Hyrox() {
  const d = await hyroxData();
  const p = d.prediction;
  const division = d.athlete.hyrox_division as Division;
  const ref = REFERENCE[division];
  const refTotal = (r: typeof ref.average) => r.run * 8 + r.roxzone + Object.values(r.stations).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">HYROX</h1>
          <p className="text-sm text-muted">{DIVISIONS[division]} · <Link href="/settings" className="text-accent">change</Link></p>
        </div>
        <div className="flex gap-2">
          <Link href="/log/station" className="btn-ghost text-sm">+ Benchmark</Link>
          <Link href="/log/hyrox" className="btn-primary text-sm">+ Sim/race</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="card">
          <div className="label">Predicted finish time</div>
          <div className="tabular mt-1 text-5xl font-bold">{formatDuration(p.total)}</div>
          <div className="tabular mt-1 text-sm text-muted">likely range {formatDuration(p.low)} – {formatDuration(p.high)}</div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>Based on your own data</span>
              <span className="tabular">{Math.round(p.confidence * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-good" style={{ width: `${p.confidence * 100}%` }} />
            </div>
            {p.confidence < 0.7 && (
              <p className="mt-2 text-xs text-muted">Segments marked <span style={{ color: "var(--warn)" }}>typical</span> use average times for your division. Log benchmarks or a sim to make the prediction yours.</p>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
            <div><div className="text-xs text-muted">Typical finisher</div><div className="tabular font-semibold">{formatDuration(refTotal(ref.average))}</div></div>
            <div><div className="text-xs text-muted">Top ~15%</div><div className="tabular font-semibold">{formatDuration(refTotal(ref.fast))}</div></div>
          </div>
        </div>

        <div className="card">
          <div className="label mb-2">Where you can gain the most time</div>
          {d.opportunities.length ? (
            <ol className="space-y-3">
              {d.opportunities.map((o, i) => (
                <li key={o.key} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{o.name}</div>
                    <div className="text-sm text-muted">
                      {formatDuration(o.gap)} slower than the top ~15%
                      {o.source === "reference" ? " (estimate — no data yet)" : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Every segment is already near the top-15% times. Impressive.</p>
          )}
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            Running is {Math.round((p.segments[0].time / p.total) * 100)}% of your race. Your HYROX runs are modelled at {Math.round(p.runPenalty * 100)}% slower than open 10K pace ({p.runPenaltySource}).
          </p>
        </div>
      </div>

      {d.trend.length > 1 && (
        <div className="card">
          <div className="label mb-2">Predicted time — last 6 months</div>
          <HyroxTrendChart data={d.trend} average={refTotal(ref.average)} fast={refTotal(ref.fast)} />
        </div>
      )}

      <div className="card">
        <div className="label mb-2">Segment breakdown</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal">Segment</th>
                <th className="text-right font-normal">You</th>
                <th className="text-right font-normal">Typical</th>
                <th className="text-right font-normal">Top 15%</th>
                <th className="pl-4 text-left font-normal">Based on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.segments.map((s) => {
                const tone = s.time <= s.reference.fast ? "var(--good)" : s.time <= s.reference.average ? "var(--text)" : "var(--bad)";
                return (
                  <tr key={s.key}>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted">{s.detail}</div>
                    </td>
                    <td className="tabular py-2 text-right font-semibold" style={{ color: tone }}>{formatDuration(s.time)}</td>
                    <td className="tabular py-2 text-right text-muted">{formatDuration(s.reference.average)}</td>
                    <td className="tabular py-2 text-right text-muted">{formatDuration(s.reference.fast)}</td>
                    <td className="py-2 pl-4 text-xs" style={{ color: SOURCE_STYLE[s.source].color }}>{SOURCE_STYLE[s.source].label}</td>
                  </tr>
                );
              })}
              <tr className="font-bold">
                <td className="py-2">Total</td>
                <td className="tabular py-2 text-right">{formatDuration(p.total)}</td>
                <td className="tabular py-2 text-right text-muted">{formatDuration(refTotal(ref.average))}</td>
                <td className="tabular py-2 text-right text-muted">{formatDuration(refTotal(ref.fast))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Fresh benchmarks get +10% for race fatigue, erg logs +6%. Reference times are rough guides from public results; your own data always replaces them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Sims & races</div>
          {d.sessions.length === 0 && <p className="text-sm text-muted">None yet. A full or half sim every 3–4 weeks is the best way to track race fitness.</p>}
          <ul className="divide-y divide-border">
            {d.sessions.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span>{localDate(s.start_time)} · {s.name}</span>
                <span className="tabular font-semibold">{formatDuration(s.duration_s)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="label mb-2">Recent station benchmarks</div>
          {d.benchmarks.length === 0 && <p className="text-sm text-muted">None yet. Time a station in training, e.g. 100 wall balls or 50 m sled push.</p>}
          <ul className="divide-y divide-border">
            {d.benchmarks.map((b) => {
              const st = STATION_BY_KEY[b.station];
              return (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{st.name.replace(/ \d.*$/, "")}</div>
                    <div className="text-xs text-muted">
                      {b.date}
                      {b.amount ? ` · ${b.amount}${st.unit === "reps" ? " reps" : " m"}` : ""}
                      {b.load_kg ? ` · ${b.load_kg} kg` : ""}
                      {b.fresh ? "" : " · after running"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular font-semibold">{formatDuration(b.time_s)}</span>
                    <BenchmarkDelete id={b.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
