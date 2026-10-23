import Link from "next/link";
import { DeleteButton, RpeSelect } from "@/components/ActivityControls";
import { CATEGORY_COLOR as CATEGORY_DOT } from "@/components/categories";
import { formatDuration, formatPace } from "@/lib/analysis";
import { getActivities, localDate } from "@/lib/data";
import { categorize } from "@/lib/plan";
import { isRun } from "@/lib/strava";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { hr: "heart rate", rpe: "RPE", strava: "Strava effort", duration: "duration only" };

const ACTIONS = [
  { href: "/log/erg", title: "Erg session", text: "Photo of the SkiErg / RowErg / BikeErg monitor", icon: "📷" },
  { href: "/log/hyrox", title: "HYROX sim or race", text: "Splits by hand or from a results screenshot", icon: "🏁" },
  { href: "/log/station", title: "Station benchmark", text: "Timed sled, wall balls, lunges, carries…", icon: "⏱️" },
  { href: "/session/new", title: "Class / workout", text: "HIIT, gym class, strength — photo or by hand", icon: "🏋️" },
  { href: "/checkin", title: "Morning check-in", text: "HRV, sleep, Body Battery from Garmin", icon: "🌅" },
];

export default async function Log() {
  const activities = await getActivities(120);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Log</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="card block transition hover:border-accent">
            <div className="text-2xl">{a.icon}</div>
            <div className="mt-1 font-semibold">{a.title}</div>
            <div className="text-xs text-muted">{a.text}</div>
          </Link>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="label">Training log — last 120 days</div>
          <p className="text-xs text-muted">Runs and Garmin sessions arrive from Strava. Add RPE to sessions without heart rate for a better load estimate.</p>
        </div>
        <Link href="/ergs" className="shrink-0 text-sm text-accent">Erg PBs →</Link>
      </div>
      <div className="card p-0">
        <ul className="divide-y divide-border">
          {activities.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${a.excluded ? "opacity-50" : ""}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_DOT[categorize(a.sport, a.name, a.focus, a.entries, a.garmin_type)] }} />
              <div className="min-w-0 flex-1">
                <Link href={`/session/${a.id}`} className="block truncate font-medium hover:text-accent">{a.name}</Link>
                <div className="tabular text-xs text-muted">
                  {localDate(a.start_time)} · {a.sport} · {formatDuration(a.moving_s ?? a.duration_s)}
                  {a.distance_m ? ` · ${(a.distance_m / 1000).toFixed(2)} km` : ""}
                  {isRun(a.sport) && a.distance_m ? ` · ${formatPace((a.moving_s ?? a.duration_s) / (a.distance_m / 1000))}/km` : ""}
                  {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                  {a.excluded ? " · merged into a logged session" : ""}
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
