import Link from "next/link";
import { SkiTrendChart } from "@/components/Charts";
import { formatDuration } from "@/lib/analysis";
import { localDate, skiData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Ski() {
  const d = await skiData();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SkiErg</h1>
        <Link href="/ski/new" className="btn-primary">+ Log session</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="label">Sessions</div><div className="tabular mt-1 text-2xl font-bold">{d.totals.sessions}</div></div>
        <div className="card"><div className="label">Total km</div><div className="tabular mt-1 text-2xl font-bold">{(d.totals.metres / 1000).toFixed(1)}</div></div>
        <div className="card"><div className="label">Calories</div><div className="tabular mt-1 text-2xl font-bold">{Math.round(d.totals.calories)}</div></div>
      </div>

      <div className="card">
        <div className="label mb-2">Personal bests</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {d.pbs.map((p) => (
            <div key={p.distance}>
              <div className="text-sm text-muted">{p.distance} m</div>
              <div className="tabular text-lg font-bold">{p.time ? formatDuration(p.time) : "–"}</div>
              {p.time && <div className="tabular text-xs text-muted">{formatDuration((p.time / p.distance) * 500)}/500m · {p.date}</div>}
            </div>
          ))}
        </div>
      </div>

      {d.trend.length > 1 && (
        <div className="card">
          <div className="label mb-2">Average pace per session</div>
          <SkiTrendChart data={d.trend} />
        </div>
      )}

      <div className="card">
        <div className="label mb-2">Sessions</div>
        {d.sessions.length === 0 && <p className="text-sm text-muted">No sessions yet. Snap the monitor after your next workout.</p>}
        <ul className="divide-y divide-border">
          {d.sessions.map((s) => {
            const det = (s.details ?? {}) as { pace_500m_s?: number; stroke_rate?: number };
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                {s.photo_path ? (
                  <a href={`/api/photo/${s.photo_path}`} target="_blank" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-lg" title="View photo">📷</a>
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted">✎</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="tabular text-xs text-muted">
                    {localDate(s.start_time)} · {formatDuration(s.duration_s)}
                    {s.distance_m ? ` · ${s.distance_m} m` : ""}
                    {det.pace_500m_s ? ` · ${formatDuration(det.pace_500m_s)}/500m` : ""}
                    {s.calories ? ` · ${s.calories} cal` : ""}
                    {s.avg_hr ? ` · ${Math.round(s.avg_hr)} bpm` : ""}
                  </div>
                </div>
                <div className="tabular text-right">
                  <div className="font-semibold">{Math.round(s.load ?? 0)}</div>
                  <div className="text-xs text-muted">load</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
