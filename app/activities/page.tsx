import { DeleteButton, RpeSelect } from "@/components/ActivityControls";
import { formatDuration, formatPace } from "@/lib/analysis";
import { getActivities, localDate } from "@/lib/data";
import { isRun } from "@/lib/strava";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { hr: "heart rate", rpe: "RPE", strava: "Strava effort", duration: "duration only" };

export default async function Activities() {
  const activities = await getActivities(120);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Training log</h1>
        <p className="text-sm text-muted">Last 120 days. Add RPE to sessions without heart rate for a better load estimate.</p>
      </div>
      <div className="card p-0">
        <ul className="divide-y divide-border">
          {activities.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${a.excluded ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="tabular text-xs text-muted">
                  {localDate(a.start_time)} · {a.sport} · {formatDuration(a.moving_s ?? a.duration_s)}
                  {a.distance_m ? ` · ${(a.distance_m / 1000).toFixed(2)} km` : ""}
                  {isRun(a.sport) && a.distance_m ? ` · ${formatPace((a.moving_s ?? a.duration_s) / (a.distance_m / 1000))}/km` : ""}
                  {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                  {a.excluded ? " · merged into SkiErg log" : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular font-semibold" title={`Load from ${METHOD[a.load_method ?? ""] ?? "?"}`}>{Math.round(a.load ?? 0)}</span>
                {a.load_method !== "hr" && <RpeSelect id={a.id} value={a.rpe} />}
                {a.source !== "strava" && <DeleteButton id={a.id} />}
              </div>
            </li>
          ))}
          {activities.length === 0 && <li className="p-4 text-sm text-muted">Nothing yet.</li>}
        </ul>
      </div>
    </div>
  );
}
