import { EfficiencyChart, ThresholdTrendChart, WeeklyKmChart } from "@/components/Charts";
import { formatDuration, formatPace, hrZoneBounds } from "@/lib/analysis";
import { localDate, runningData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Running() {
  const d = await runningData();

  if (!d.hasRuns) {
    return (
      <div className="card mt-6 text-center text-muted">No runs yet — connect Strava in Settings and sync.</div>
    );
  }

  const zones = hrZoneBounds(d.athlete.threshold_hr);
  const a = d.athlete;
  const garmin = [a.garmin_pred_5k, a.garmin_pred_10k, a.garmin_pred_half, a.garmin_pred_marathon].some(Boolean)
    ? [a.garmin_pred_5k, a.garmin_pred_10k, a.garmin_pred_half, a.garmin_pred_marathon]
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Running</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card">
          <div className="label">Threshold pace</div>
          <div className="tabular mt-1 text-2xl font-bold">{d.thresholdPace ? `${formatPace(d.thresholdPace)}` : "–"}<span className="text-sm font-normal text-muted"> /km</span></div>
          <div className="text-xs text-muted">{d.estimate.source}</div>
        </div>
        <div className="card">
          <div className="label">VDOT</div>
          <div className="tabular mt-1 text-2xl font-bold">{d.estimate.vdot ?? "–"}</div>
          <div className="text-xs text-muted">Daniels running fitness</div>
        </div>
        <div className="card">
          <div className="label">Critical speed</div>
          <div className="tabular mt-1 text-2xl font-bold">{d.estimate.cs ? formatPace(1000 / d.estimate.cs.cs) : "–"}<span className="text-sm font-normal text-muted"> /km</span></div>
          <div className="text-xs text-muted">{d.estimate.cs ? `D′ ${d.estimate.cs.dPrime} m` : "Needs 3–20 min hard efforts"}</div>
        </div>
        <div className="card">
          <div className="label">Threshold HR</div>
          <div className="tabular mt-1 text-2xl font-bold">{d.athlete.threshold_hr}<span className="text-sm font-normal text-muted"> bpm</span></div>
          <div className="text-xs text-muted">
            {d.athlete.garmin_lt_hr && d.athlete.garmin_lt_hr !== d.athlete.threshold_hr ? `Garmin says ${d.athlete.garmin_lt_hr} — update in Settings` : "Set in Settings"}
          </div>
        </div>
      </div>

      {(d.athlete.garmin_lt_speed || d.athlete.garmin_vo2max) && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="label">From Garmin</span>
          {d.athlete.garmin_lt_speed && (
            <span>Lactate threshold <b className="tabular">{formatPace(1000 / d.athlete.garmin_lt_speed)}/km</b>{d.athlete.garmin_lt_hr ? <> @ <b className="tabular">{d.athlete.garmin_lt_hr} bpm</b></> : null}</span>
          )}
          {d.athlete.garmin_vo2max && <span>VO2max <b className="tabular">{d.athlete.garmin_vo2max}</b></span>}
          {d.athlete.garmin_lt_date && <span className="text-xs text-muted">measured {d.athlete.garmin_lt_date}</span>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Training paces</div>
          {d.paces.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {d.paces.map((z) => (
                  <tr key={z.name}>
                    <td className="py-2 pr-2">
                      <div className="font-semibold">{z.name}</div>
                      <div className="text-xs text-muted">{z.purpose}</div>
                    </td>
                    <td className="tabular whitespace-nowrap py-2 text-right font-semibold">
                      {formatPace(z.range[0])}–{formatPace(z.range[1])}
                      <span className="font-normal text-muted"> /km</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Do a hard 3–20 min effort (or add a race in Settings) to estimate paces.</p>
          )}
        </div>

        <div className="card">
          <div className="label mb-2">Race predictions</div>
          <table className="w-full text-sm">
            {garmin.length > 0 && (
              <thead className="text-xs text-muted">
                <tr>
                  <th />
                  <th className="text-right font-normal">This app</th>
                  <th className="text-right font-normal">Garmin</th>
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border">
              {d.predictions.map((p, i) => (
                <tr key={p.name}>
                  <td className="py-2">{p.name}</td>
                  <td className="tabular py-2 text-right font-semibold">
                    {formatDuration(p.time)}
                    <div className="text-xs font-normal text-muted">{formatPace(p.time / (p.m / 1000))}/km</div>
                  </td>
                  {garmin.length > 0 && (
                    <td className="tabular py-2 pl-3 text-right font-semibold">
                      {garmin[i] ? formatDuration(garmin[i]!) : "–"}
                      {garmin[i] && <div className="text-xs font-normal text-muted">{formatPace(garmin[i]! / (p.m / 1000))}/km</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Assumes training specific to the distance. Marathon predictions are optimistic without high mileage.{garmin.length > 0 ? " Your HYROX run splits use Garmin's 10K prediction." : ""}</p>
        </div>
      </div>

      <div className="card">
        <div className="label mb-2">Threshold pace trend (90-day rolling estimate)</div>
        {d.trend.length > 1 ? <ThresholdTrendChart data={d.trend} /> : <p className="text-sm text-muted">More history needed.</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Best efforts — last 90 days</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="text-left font-normal">Duration</th><th className="text-right font-normal">Distance</th><th className="text-right font-normal">Pace</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.efforts.map((e) => (
                <tr key={e.duration}>
                  <td className="py-1.5">{e.duration / 60} min</td>
                  <td className="tabular py-1.5 text-right">{(e.distance / 1000).toFixed(2)} km</td>
                  <td className="tabular py-1.5 text-right font-semibold">{formatPace(e.pace)}/km</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.estimate.candidates.length > 0 && (
            <div className="mt-3 border-t border-border pt-2 text-xs text-muted">
              VDOT estimates: {d.estimate.candidates.map((c) => `${c.source} ${c.vdot}`).join(" · ")}
            </div>
          )}
        </div>
        <div className="card">
          <div className="label mb-2">Heart-rate zones (from threshold HR)</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {zones.map((z) => (
                <tr key={z.name}>
                  <td className="py-1.5">{z.name}</td>
                  <td className="tabular py-1.5 text-right">{z.max ? `${z.min}–${z.max}` : `${z.min}+`} bpm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Weekly volume</div>
          <WeeklyKmChart data={d.weekly} />
        </div>
        <div className="card">
          <div className="label mb-1">Aerobic efficiency — easy runs</div>
          <p className="mb-2 text-xs text-muted">Metres per minute per heartbeat. Rising = more speed for the same effort.</p>
          {d.efficiency.length > 2 ? <EfficiencyChart data={d.efficiency} /> : <p className="text-sm text-muted">Needs easy runs with heart rate.</p>}
        </div>
      </div>

      {d.longRuns.length > 0 && (
        <div className="card">
          <div className="label mb-1">Aerobic decoupling — long runs</div>
          <p className="mb-2 text-xs text-muted">Drift in pace-to-HR from first to second half. Under 5% means good aerobic durability.</p>
          <ul className="divide-y divide-border text-sm">
            {d.longRuns.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span className="truncate">{localDate(r.start_time)} · {r.name}</span>
                <span className="tabular font-semibold" style={{ color: (r.decoupling ?? 0) < 5 ? "var(--good)" : "var(--warn)" }}>{r.decoupling}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="label mb-2">Recent runs</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal">Date</th><th className="text-left font-normal">Run</th>
                <th className="text-right font-normal">km</th><th className="text-right font-normal">Pace</th>
                <th className="text-right font-normal">HR</th><th className="text-right font-normal">Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-muted">{localDate(r.start_time).slice(5)}</td>
                  <td className="max-w-[160px] truncate py-1.5">{r.name}</td>
                  <td className="tabular py-1.5 text-right">{((r.distance_m ?? 0) / 1000).toFixed(1)}</td>
                  <td className="tabular py-1.5 text-right">{r.distance_m ? formatPace((r.moving_s ?? r.duration_s) / (r.distance_m / 1000)) : "–"}</td>
                  <td className="tabular py-1.5 text-right">{r.avg_hr ? Math.round(r.avg_hr) : "–"}</td>
                  <td className="tabular py-1.5 text-right">{Math.round(r.load ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
