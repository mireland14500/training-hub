import Link from "next/link";
import { HyroxTrendChart } from "@/components/Charts";
import { BenchmarkDelete } from "@/components/ActivityControls";
import { formatDuration } from "@/lib/analysis";
import { hyroxData } from "@/lib/data";
import { confirmRace } from "@/app/actions";
import { DIVISIONS, isDoubles, reference, STATION_BY_KEY, type Source } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

const SOURCE_STYLE: Record<Source, { label: string; color: string }> = {
  "race/sim": { label: "Your sim/race", color: "var(--good)" },
  benchmark: { label: "Your benchmark", color: "var(--good)" },
  "erg log": { label: "Your erg log", color: "var(--good)" },
  "running fitness": { label: "Your runs", color: "var(--good)" },
  reference: { label: "Typical — no data", color: "var(--warn)" },
};

export default async function Hyrox({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const { division } = await searchParams;
  const d = await hyroxData(division);
  const p = d.prediction;
  const ref = reference(d.division);
  const refTotal = (r: typeof ref.average) => r.run * 8 + r.roxzone + Object.values(r.stations).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">HYROX</h1>
          <p className="text-sm text-muted">{DIVISIONS[d.division]}{isDoubles(d.division) ? " · predicted from your doubles races" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/log/station" className="btn-ghost text-sm">+ Benchmark</Link>
          <Link href="/log/hyrox" className="btn-primary text-sm">+ Sim/race</Link>
        </div>
      </div>

      {d.categories.length > 1 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {d.categories.map((c) => (
            <Link
              key={c.division}
              href={`/hyrox?division=${c.division}`}
              className={`card block p-3 transition hover:border-accent ${c.division === d.division ? "border-accent" : ""}`}
            >
              <div className="text-xs font-semibold text-muted">{c.label}</div>
              <div className="tabular mt-1 text-sm">
                Predicted <b>{formatDuration(c.prediction)}</b>
              </div>
              <div className="tabular text-sm">
                Best <b className="text-good">{c.best ? formatDuration(c.best.total) : "–"}</b>
              </div>
            </Link>
          ))}
        </div>
      )}

      {d.possibleRaces.length > 0 && (
        <div className="card space-y-2">
          <div className="label">Were these HYROX races?</div>
          <p className="text-xs text-muted">Found on Strava by name. Only confirmed races count towards your best time and prediction.</p>
          <ul className="divide-y divide-border">
            {d.possibleRaces.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {r.date} · {r.name} · <span className="tabular">{formatDuration(r.total)}</span>
                </span>
                <form action={confirmRace} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button name="answer" value="race" className="btn-ghost px-3 py-1 text-xs">Race</button>
                  <button name="answer" value="training" className="btn-ghost px-3 py-1 text-xs">Training</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="card">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label">Predicted</div>
              <div className="tabular mt-1 text-4xl font-bold">{formatDuration(p.total)}</div>
              <div className="tabular mt-1 text-xs text-muted">range {formatDuration(p.low)} – {formatDuration(p.high)}</div>
              {p.simAnchor && (
                <div className="mt-1 text-xs font-semibold text-good">
                  Set by your {formatDuration(p.simAnchor.total)} sim ({p.simAnchor.date})
                </div>
              )}
            </div>
            <div>
              <div className="label">Your best</div>
              {d.pb ? (
                <>
                  <div className="tabular mt-1 text-4xl font-bold text-good">{formatDuration(d.pb.total)}</div>
                  <div className="mt-1 truncate text-xs text-muted">{d.pb.name} · {d.pb.date}</div>
                </>
              ) : (
                <div className="mt-2 text-sm text-muted">No race yet — log one below.</div>
              )}
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>Based on your own data</span>
              <span className="tabular">{Math.round(p.confidence * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-good" style={{ width: `${p.confidence * 100}%` }} />
            </div>
            {p.simAnchor && (
            <p className="mt-2 text-xs text-muted">
              Your {p.simAnchor.label} on {p.simAnchor.date} beat the segment-by-segment estimate ({formatDuration(p.simAnchor.modelled)}), so the prediction uses the sim. The segments below are scaled to match.
            </p>
          )}
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
          <div className="label mb-2">Your races</div>
          {d.results.length === 0 && (
            <p className="text-sm text-muted">
              None found. Races are picked up from Strava when the activity name includes &quot;HYROX&quot;, or log one with splits via <Link href="/log/hyrox" className="text-accent">+ Sim/race</Link>.
            </p>
          )}
          <ul className="divide-y divide-border">
            {d.results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <Link href={`/session/${r.id}`} className="block truncate hover:text-accent">{r.date} · {r.name}</Link>
                  <div className="text-xs text-muted">
                    {DIVISIONS[r.division]} · {r.hasSplits ? "splits logged" : <>no splits — <Link href="/log/hyrox" className="text-accent">add them</Link> for a sharper prediction</>}
                  </div>
                </div>
                <span className={`tabular shrink-0 font-semibold ${d.pb?.id === r.id ? "text-good" : ""}`}>{formatDuration(r.total)}</span>
              </li>
            ))}
          </ul>
          <div className="label mb-1 mt-4">Sims</div>
          {d.sims.length === 0 ? (
            <p className="text-sm text-muted">
              None yet. Name a Strava session &quot;Hyrox sim&quot; or &quot;simulation&quot; (or log one with splits) and full sims count towards your singles prediction.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {d.sims.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/session/${s.id}`} className="block truncate hover:text-accent">{s.date} · {s.name}</Link>
                    <div className="text-xs text-muted">
                      {s.kind === "full" ? "Full sim · counts towards the prediction" : "Half sim · not used for the full-race time"}
                      {s.fromStrava ? " · from Strava" : ""}
                    </div>
                  </div>
                  <span className={`tabular shrink-0 font-semibold ${p.simAnchor && p.simAnchor.date === s.date && p.simAnchor.total === s.total ? "text-good" : ""}`}>{formatDuration(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
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
