import Link from "next/link";
import { deletePaceTest, deletePlan, savePaceTest, savePlan } from "@/app/actions";
import { formatDuration, formatPace } from "@/lib/analysis";
import { planData } from "@/lib/data";

export const dynamic = "force-dynamic";

type Data = Awaited<ReturnType<typeof planData>>;
type Week = Data["weeks"][number];
type Session = Week["days"][number]["sessions"][number];

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const PHASE_COLOR: Record<string, string> = { Base: "var(--c-run)", Build: "var(--warn)", Specific: "var(--accent)", Taper: "var(--good)", "Race week": "var(--bad)" };
/** Card colour by workout type, Runna-style. */
const TYPE: Record<string, { color: string; label: string }> = {
  easy: { color: "var(--good)", label: "Easy" },
  long: { color: "var(--c-ski)", label: "Long run" },
  brick: { color: "var(--good)", label: "Easy" },
  threshold: { color: "var(--accent)", label: "Threshold" },
  intervals: { color: "var(--bad)", label: "Intervals" },
  test: { color: "var(--bad)", label: "5K test" },
  "bike-easy": { color: "var(--c-run)", label: "BikeErg" },
  "bike-intervals": { color: "var(--c-run)", label: "BikeErg intervals" },
  hyrox: { color: "var(--warn)", label: "HYROX" },
  strength: { color: "var(--c-other)", label: "Strength" },
  race: { color: "var(--bad)", label: "Race" },
  rest: { color: "var(--border)", label: "Rest" },
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const d = await planData();
  if (!d.ready)
    return (
      <div className="card mx-auto mt-6 max-w-xl text-sm">
        The plan needs two new tables. Run <code className="rounded bg-bg px-1">supabase/schema.sql</code> in the Supabase SQL Editor, then reload.
      </div>
    );
  if (!d.config) return <Setup d={d} />;

  const { w } = await searchParams;
  const defaultIdx = d.current >= 0 ? d.current : d.today < d.weeks[0].start ? 0 : d.weeks.length - 1;
  const idx = Math.min(d.weeks.length - 1, Math.max(0, w !== undefined && /^\d+$/.test(w) ? Number(w) : defaultIdx));
  const week = d.weeks[idx];
  const planned = week.days.flatMap((x) => x.sessions).filter((s) => s.type !== "rest");
  const doneCount = planned.filter((s) => s.status === "done").length;
  const weeksLeft = d.config.race ? Math.ceil((Date.parse(d.config.race.date) - Date.parse(d.today)) / (7 * 86400_000)) : null;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">Plan</h1>
        <p className="text-sm text-muted">
          {d.config.race ? `${d.config.race.name} · ${fmtDay(d.config.race.date)}${weeksLeft !== null && weeksLeft > 0 ? ` · ${weeksLeft} weeks to go` : ""}` : `${d.weeks.length}-week block`}
        </p>
      </div>

      {/* Week picker */}
      <nav className="-mx-4 overflow-x-auto px-4" aria-label="Weeks">
        <ol className="flex gap-1.5 pb-1">
          {d.weeks.map((x) => (
            <li key={x.index}>
              <Link
                href={`/plan?w=${x.index}`}
                scroll={false}
                aria-current={x.index === idx ? "true" : undefined}
                className={`flex w-11 flex-col items-center rounded-xl border py-1.5 text-xs ${x.index === idx ? "border-accent bg-accent/10 font-bold text-accent" : "border-border"}`}
              >
                <span>W{x.index + 1}</span>
                <span className="mt-1 h-1 w-5 rounded-full" style={{ background: PHASE_COLOR[x.phase], opacity: x.lighter ? 0.45 : 1 }} />
                {x.index === d.current && <span className="mt-0.5 text-[9px] text-muted">now</span>}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <section className="flex items-center justify-between gap-3">
        <Link href={`/plan?w=${Math.max(0, idx - 1)}`} scroll={false} aria-label="Previous week" className={`btn-ghost px-3 ${idx === 0 ? "pointer-events-none opacity-30" : ""}`}>‹</Link>
        <div className="min-w-0 text-center">
          <div className="font-bold">
            Week {idx + 1} · {fmtDay(week.start)} – {fmtDay(week.days[6].date)}
          </div>
          <div className="text-xs text-muted">
            <span className="font-semibold" style={{ color: PHASE_COLOR[week.phase] }}>
              {week.phase}
              {week.lighter ? " (lighter)" : ""}
            </span>{" "}
            · {week.km} km run · {week.bikeMin} min bike{planned.length ? ` · ${doneCount}/${planned.length} done` : ""}
          </div>
        </div>
        <Link href={`/plan?w=${Math.min(d.weeks.length - 1, idx + 1)}`} scroll={false} aria-label="Next week" className={`btn-ghost px-3 ${idx === d.weeks.length - 1 ? "pointer-events-none opacity-30" : ""}`}>›</Link>
      </section>
      <p className="-mt-1 text-center text-xs text-muted">{week.focus}</p>

      <ol className="space-y-2">
        {week.days.map((day, k) => {
          const isToday = day.date === d.today;
          const work = day.sessions.filter((s) => s.type !== "rest");
          return (
            <li key={day.date} className={`grid grid-cols-[2.8rem_1fr] gap-2.5 ${day.date < d.today ? "opacity-80" : ""}`}>
              <div className={`pt-2 text-center ${isToday ? "text-accent" : ""}`}>
                <div className="text-xs font-semibold uppercase">{DOW[k]}</div>
                <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-accent text-bg" : ""}`}>{Number(day.date.slice(8))}</div>
              </div>
              <div className="min-w-0 space-y-1.5">
                {work.length === 0 && day.done.length === 0 && <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted">Rest day</div>}
                {work.map((s, i) => (
                  <WorkoutCard key={i} s={s} />
                ))}
                {day.done
                  .filter((a) => !work.some((s) => s.activityId === a.id))
                  .map((a) => (
                    <Link key={a.id} href={`/session/${a.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm hover:text-accent">
                      <span className="min-w-0 truncate">✓ {a.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted">{a.detail}</span>
                    </Link>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>

      <Paces d={d} />

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Plan settings</summary>
        <div className="mt-2 space-y-2 text-sm text-muted">
          <p>
            {d.config.weeks} weeks from {fmtDay(d.config.start)} · {d.config.startKm} → {d.config.peakKm} km/week · {d.config.runDays} run days.
            {d.latestRun ? ` HYROX sessions use ${formatPace(d.latestRun - 5)}/km — just under your latest race average.` : ""}
          </p>
          <p>Mostly easy running; one threshold session a week; run or BikeErg intervals; BikeErg zone 2 for extra aerobic work without impact; a weekly HYROX session building to sims; every 4th week lighter; 5K test after each lighter week.</p>
          <form action={deletePlan}>
            <button className="text-bad">Delete plan and start over</button>
          </form>
        </div>
      </details>
    </div>
  );
}

function WorkoutCard({ s }: { s: Session }) {
  const t = TYPE[s.type] ?? TYPE.easy;
  const done = s.status === "done";
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card" style={{ borderLeft: `4px solid ${t.color}` }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.color }}>{t.label}</span>
          <span className={`block truncate font-bold leading-snug ${done ? "text-muted" : ""}`}>{s.title.replace(/^(Threshold|Intervals|BikeErg): /, "")}</span>
          {s.summary && <span className="tabular block text-xs text-muted">{s.summary}</span>}
        </span>
        {done ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-good text-sm font-bold text-bg" aria-label="done">✓</span>
        ) : s.status === "missed" ? (
          <span className="shrink-0 text-xs text-muted">missed</span>
        ) : (
          <span className="shrink-0 text-muted transition group-open:rotate-90" aria-hidden>›</span>
        )}
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2.5">
        {s.steps && (
          <ol className="space-y-1.5">
            {s.steps.map((st, i) => (
              <li key={i} className="grid grid-cols-[5.2rem_1fr] gap-2 text-sm">
                <span className="text-xs font-semibold uppercase text-muted">{st.label}</span>
                <span>
                  {st.what}
                  {st.pace && <span className="tabular ml-1.5 inline-block rounded-md bg-bg px-1.5 text-xs font-semibold">{st.pace}/km</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {!s.steps?.some((st) => s.detail.startsWith(st.what.slice(0, 24))) && <p className="text-xs text-muted">{s.detail}</p>}
        {s.activityId && (
          <Link href={`/session/${s.activityId}`} className="text-sm font-semibold text-accent">
            See how it went →
          </Link>
        )}
      </div>
    </details>
  );
}

function Paces({ d }: { d: Data }) {
  const p = d.paces;
  return (
    <details id="paces" className="card">
      <summary className="cursor-pointer text-sm font-semibold">
        Your paces{d.source ? ` · 5K ${formatDuration(d.source.fiveK)}` : ""}
      </summary>
      <div className="mt-2 space-y-3">
        <p className="text-xs text-muted">{d.source ? `From your ${d.source.label}.` : "Log a 5K to set your paces."} Every 5K test updates the workouts above.</p>
        {p && (
          <ul className="tabular divide-y divide-border text-sm">
            {[
              ["Easy / long", p.easy],
              ["Marathon", p.marathon],
              ["Threshold", p.threshold],
              ["Interval", p.interval],
            ].map(([name, pace]) => (
              <li key={name} className="flex justify-between py-1.5">
                <span>{name}</span>
                <b>{pace}/km</b>
              </li>
            ))}
          </ul>
        )}
        <form action={savePaceTest} className="space-y-2 rounded-xl bg-bg p-3">
          <div className="text-sm font-semibold">Log a 5K test or hard effort</div>
          <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-2">
            <input name="time" required placeholder="21:30" inputMode="numeric" className="input" aria-label="Time" />
            <input name="date" type="date" defaultValue={d.today} className="input min-w-0" aria-label="Date" />
            <select name="distance_m" defaultValue="5000" className="input" aria-label="Distance">
              <option value="5000">5K</option>
              <option value="3000">3K</option>
              <option value="10000">10K</option>
            </select>
          </div>
          <button className="btn-primary w-full">Save test & update paces</button>
          {d.stravaFiveK && (
            <p className="text-xs text-muted">
              Fastest 5K inside a run on Strava (60 days): <b className="tabular">{formatDuration(d.stravaFiveK.seconds)}</b> on {fmtDay(d.stravaFiveK.date)}.
            </p>
          )}
        </form>
        {d.tests.length > 0 && (
          <ul className="tabular divide-y divide-border text-sm">
            {d.tests.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {fmtDay(t.date)} · {Number(t.distance_m) / 1000} km
                </span>
                <span className="flex items-center gap-3">
                  <b>{formatDuration(Number(t.time_s))}</b>
                  <form action={deletePaceTest}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-muted hover:text-bad" aria-label="Delete test">✕</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Setup({ d }: { d: Data }) {
  const startKm = d.defaults.startKm >= 10 ? d.defaults.startKm : 28;
  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div>
        <h1 className="text-2xl font-extrabold">Plan</h1>
        <p className="text-sm text-muted">Suggested workouts for every day: more running volume, the BikeErg for extra aerobic work, paces from your 5K.</p>
      </div>
      <form action={savePlan} className="card space-y-3">
        <label className="block">
          <span className="text-xs text-muted">Build towards</span>
          <select name="race_id" defaultValue={d.defaults.race?.id ?? ""} className="input mt-1">
            <option value="">No race — just a block</option>
            {d.races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {fmtDay(r.date)}
              </option>
            ))}
          </select>
          {d.races.length === 0 && (
            <span className="mt-1 block text-xs text-muted">
              Add races on the <Link href="/body" className="text-accent">Body</Link> tab to taper into one.
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start (a Monday)" name="start" type="date" value={d.defaults.start} />
          <Field label="Weeks (if no race)" name="weeks" value="16" />
          <Field label="Running km/week now" name="start_km" value={String(startKm)} />
          <Field label="Peak km/week" name="peak_km" value={String(Math.max(startKm + 5, Math.min(60, Math.round(startKm * 1.6))))} />
        </div>
        <label className="block">
          <span className="text-xs text-muted">Run days a week (Saturday HYROX sessions count on top)</span>
          <select name="run_days" defaultValue="5" className="input mt-1">
            <option value="4">4 — more bike, less impact</option>
            <option value="5">5 — balanced (recommended)</option>
            <option value="6">6 — most running</option>
          </select>
        </label>
        <p className="text-xs text-muted">
          Paces come from{" "}
          {!d.source ? "a 5K test — the plan starts with one" : d.source.fromTest ? `your ${d.source.label} (5K ${formatDuration(d.source.fiveK)})` : `an estimate from your recent runs (5K ${formatDuration(d.source.fiveK)}) until you log a 5K test`}.
        </p>
        <button className="btn-primary w-full">Build my plan</button>
      </form>
    </div>
  );
}

function Field({ label, name, value, type = "text" }: { label: string; name: string; value: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input name={name} type={type} defaultValue={value} required={name !== "weeks"} inputMode={type === "text" ? "numeric" : undefined} className="input mt-1" />
    </label>
  );
}
