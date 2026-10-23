import Link from "next/link";
import BandSparkline from "@/components/BandSparkline";
import { formatDuration, formatPace } from "@/lib/analysis";
import { runningProgress } from "@/lib/data";

export const dynamic = "force-dynamic";

function Change({ seconds, better }: { seconds: number; better: "lower" }) {
  const s = Math.round(seconds);
  if (Math.abs(s) < 2) return <span className="font-semibold text-muted">▬ about the same</span>;
  const faster = better === "lower" ? s < 0 : s > 0;
  return (
    <span className="font-bold" style={{ color: faster ? "var(--good)" : "var(--warn)" }}>
      {faster ? "▲" : "▼"} {Math.abs(s)} s {faster ? "faster" : "slower"}
    </span>
  );
}

export default async function Running() {
  const d = await runningProgress();
  if (!d.hasRuns) return <div className="card mt-6 text-center text-muted">No runs yet — connect Strava in Settings and sync.</div>;
  const a = d.athlete;

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div>
        <h1 className="text-2xl font-extrabold">Running</h1>
        <p className="text-sm text-muted">What you actually ran · no predictions</p>
      </div>

      <section className="card space-y-2">
        <div className="label">Easy pace at {d.refHr} bpm</div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="tabular text-3xl font-extrabold">{d.easyNow ? formatPace(d.easyNow) : "–"}</span>
          <span className="text-sm text-muted">/km</span>
          {d.easyChange && (
            <span className="text-sm">
              <Change seconds={d.easyChange.change} better="lower" /> <span className="text-muted">vs previous 4 weeks</span>
            </span>
          )}
        </div>
        <p className="text-sm text-muted">Same heart rate, faster pace = your aerobic engine is improving.</p>
        <BandSparkline points={d.weekly.map((w) => w.value)} band={null} invert color="var(--accent)" height={110} label="Weekly easy pace at a fixed heart rate over the last 12 weeks; higher is faster" />
        <div className="flex justify-between text-[11px] text-muted">
          <span>{d.weekly.length ? `w/c ${d.weekly[0].date.slice(5)}` : ""}</span>
          <span>this week</span>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted">Garmin LT</div>
          <div className="tabular mt-1 text-xl font-extrabold">{a.garmin_lt_speed ? formatPace(1000 / a.garmin_lt_speed) : "–"}</div>
          <div className="text-xs text-muted">{a.garmin_lt_hr ? `@ ${a.garmin_lt_hr} bpm` : "run npm run garmin"}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted">VO2max</div>
          <div className="tabular mt-1 text-xl font-extrabold">{a.garmin_vo2max ?? "–"}</div>
          <div className="text-xs text-muted">Garmin</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted">This week</div>
          <div className="tabular mt-1 text-xl font-extrabold">{Math.round(d.weekKm)} km</div>
          <div className="text-xs text-muted">avg {Math.round(d.avgKm)}</div>
        </div>
      </div>

      <section className="card">
        <div className="label mb-1">Best efforts</div>
        {d.bests.length ? (
          <table className="tabular w-full text-[15px]">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-normal" />
                <th className="py-1 text-right font-normal">Last 90 d</th>
                <th className="py-1 text-right font-normal">90 d before</th>
                <th className="py-1 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.bests.map((b) => {
                const diff = b.recent && b.before ? b.recent.seconds - b.before.seconds : null;
                return (
                  <tr key={b.name}>
                    <td className="py-2">{b.name}</td>
                    <td className="py-2 text-right font-bold">
                      {b.recent ? <Link href={`/session/${b.recent.activityId}`} className="hover:text-accent">{formatDuration(b.recent.seconds)}</Link> : "–"}
                    </td>
                    <td className="py-2 text-right text-muted">{b.before ? formatDuration(b.before.seconds) : "–"}</td>
                    <td className="py-2 text-right font-bold" style={{ color: diff === null || diff === 0 ? "var(--muted)" : diff < 0 ? "var(--good)" : "var(--warn)" }}>
                      {diff === null ? "–" : diff === 0 ? "same" : `${diff < 0 ? "−" : "+"}${Math.abs(diff) < 60 ? `${Math.abs(diff)} s` : formatDuration(Math.abs(diff))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">
            {d.hasStravaBests ? "No best efforts in the last 6 months." : "Appear once your runs are analysed: Settings → Re-analyse runs, then Sync Strava a few times."}
          </p>
        )}
      </section>

      <section className="card">
        <div className="label mb-1">Quality sessions · last 60 days</div>
        {d.quality.length ? (
          <ul className="divide-y divide-border">
            {d.quality.map((q) => (
              <li key={q.id}>
                <Link href={`/session/${q.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                  <span className="min-w-0 truncate">
                    {new Date(q.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · {q.name}
                  </span>
                  <span className="tabular shrink-0 font-bold">{q.pace ? `${formatPace(q.pace)}/km` : "add reps"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No threshold or interval runs found. Set a session&apos;s type to Threshold or Intervals on the Calendar.</p>
        )}
      </section>

      {d.paces.length > 0 && (
        <section className="card">
          <div className="label mb-1">Your training paces{a.garmin_lt_speed ? " · from Garmin LT" : ""}</div>
          <ul className="tabular divide-y divide-border text-sm">
            {d.paces.map((z) => (
              <li key={z.name} className="flex justify-between py-2">
                <span>{z.name}</span>
                <span className="font-bold">{formatPace(z.range[0])}–{formatPace(z.range[1])}/km</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
