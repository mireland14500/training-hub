import Link from "next/link";
import { deletePaceTest, deletePlan, savePaceTest, savePlan } from "@/app/actions";
import { formatDuration, formatPace } from "@/lib/analysis";
import { planData } from "@/lib/data";

export const dynamic = "force-dynamic";

type Data = Awaited<ReturnType<typeof planData>>;
type Week = Data["weeks"][number];

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const PHASE_COLOR: Record<string, string> = { Base: "var(--c-run)", Build: "var(--warn)", Specific: "var(--accent)", Taper: "var(--good)", "Race week": "var(--bad)" };
const TYPE_ICON: Record<string, string> = {
  easy: "🏃", long: "🏃", threshold: "🔥", intervals: "⚡", test: "⏱️", brick: "🏃", race: "🏁",
  "bike-easy": "🚴", "bike-intervals": "🚴", hyrox: "🏋️", strength: "💪", rest: "😴",
};

export default async function PlanPage() {
  const d = await planData();
  if (!d.ready)
    return (
      <div className="card mx-auto mt-6 max-w-xl text-sm">
        The plan needs two new tables. Run <code className="rounded bg-bg px-1">supabase/schema.sql</code> in the Supabase SQL Editor, then reload.
      </div>
    );
  if (!d.config) return <Setup d={d} />;

  const week = d.current >= 0 ? d.weeks[d.current] : d.today < d.weeks[0]?.start ? d.weeks[0] : null;
  const nextWeek = week ? d.weeks[week.index + 1] : null;
  const done = (w: Week) => {
    const s = w.days.flatMap((x) => x.sessions).filter((x) => x.status !== "rest" && (x.status === "done" || x.status === "missed"));
    return s.length ? s.filter((x) => x.status === "done").length / s.length : null;
  };

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Plan</h1>
          <p className="text-sm text-muted">
            {week ? `Week ${week.index + 1} of ${d.weeks.length} · ${week.phase}${week.lighter ? " (lighter)" : ""}` : "Plan finished"}
            {d.config.race ? ` · ${d.config.race.name} ${fmtDay(d.config.race.date)}` : ""}
          </p>
        </div>
      </div>

      {d.goals && (d.goals.singles || d.goals.doubles) && <Goals d={d} />}

      {week && <WeekCard week={week} title={d.current >= 0 ? "This week" : "Starts"} today={d.today} />}
      {nextWeek && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">
            Next week · {nextWeek.phase}
            {nextWeek.lighter ? " (lighter)" : ""} · {nextWeek.km} km run + {nextWeek.bikeMin} min bike
          </summary>
          <div className="mt-3">
            <WeekBody week={nextWeek} today={d.today} />
          </div>
        </details>
      )}

      <Paces d={d} />

      <section className="card">
        <div className="label mb-2">The whole block</div>
        <ol className="space-y-1">
          {d.weeks.map((w) => {
            const c = done(w);
            return (
              <li key={w.index} className={`grid grid-cols-[2rem_4.6rem_1fr_3rem] items-center gap-2 rounded-lg px-1.5 py-1 text-sm ${w.index === d.current ? "bg-accent/10" : ""}`}>
                <span className="tabular text-muted">W{w.index + 1}</span>
                <span className="text-xs font-semibold" style={{ color: PHASE_COLOR[w.phase] }}>
                  {w.phase}
                  {w.lighter ? " ·L" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block h-2 rounded-full" style={{ width: `${Math.max(6, (w.km / Math.max(...d.weeks.map((x) => x.km))) * 100)}%`, background: PHASE_COLOR[w.phase], opacity: w.lighter ? 0.5 : 0.9 }} />
                  </span>
                  <span className="tabular w-11 shrink-0 text-right text-xs text-muted">{w.km} km</span>
                </span>
                <span className="tabular text-right text-xs">{c === null ? "" : `${Math.round(c * 100)}%`}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-muted">Run km per week; ·L = lighter week. % = sessions done so far.</p>
      </section>

      <Approach />

      <form action={deletePlan} className="text-center">
        <button className="text-xs text-muted hover:text-bad">Delete plan and start over</button>
      </form>
    </div>
  );
}

function Goals({ d }: { d: Data }) {
  const rows = [d.goals?.singles, d.goals?.doubles].filter((g): g is NonNullable<typeof g> => !!g);
  const fiveKNow = d.source?.fiveK ?? null;
  return (
    <section className="card space-y-3">
      <div className="label">What your goals need</div>
      {rows.map((g) => {
        const gap = g.runNow - g.kmPace;
        return (
          <div key={g.label} className="rounded-xl bg-bg p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">Sub-{Math.round(g.goal / 60)} · {g.label}</span>
              <span className="tabular text-xs text-muted">predicted now {formatDuration(g.predicted)}</span>
            </div>
            <div className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[11px] uppercase text-muted">HYROX km</div>
                <div className="text-lg font-extrabold">{formatPace(g.kmPace)}</div>
                <div className="text-[11px] text-muted">now {formatPace(g.runNow)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted">Open 10K</div>
                <div className="text-lg font-extrabold">{formatDuration(g.tenKPace * 10)}</div>
                <div className="text-[11px] text-muted">{formatPace(g.tenKPace)}/km</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted">5K</div>
                <div className="text-lg font-extrabold">{formatDuration(g.fiveK)}</div>
                <div className="text-[11px] text-muted">{fiveKNow ? `now ${formatDuration(fiveKNow)}` : ""}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              {gap > 1
                ? `Your HYROX kms need to come down ${Math.round(gap)} s/km, assuming stations and Roxzone stay at today's ${formatDuration(g.nonRun)}. Faster stations lower the running you need.`
                : "Your current running already supports this — it's the stations and transitions now."}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function WeekCard({ week, title, today }: { week: Week; title: string; today: string }) {
  return (
    <section className="card space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="label">
          {title} · {fmtDay(week.start)}
        </div>
        <span className="tabular text-xs text-muted">
          {week.km} km run · {week.bikeMin} min bike
        </span>
      </div>
      <p className="text-sm text-muted">{week.focus}</p>
      <WeekBody week={week} today={today} />
    </section>
  );
}

function WeekBody({ week, today }: { week: Week; today: string }) {
  return (
    <ul className="divide-y divide-border">
      {week.days.map((day, k) => (
        <li key={day.date} className={`grid grid-cols-[2.6rem_1fr] gap-2 py-2 ${day.date === today ? "-mx-2 rounded-lg bg-accent/10 px-2" : ""}`}>
          <div className="text-xs">
            <div className="font-bold">{DOW[k]}</div>
            <div className="text-muted">{fmtDay(day.date).split(" ")[0]}</div>
          </div>
          <div className="min-w-0 space-y-1.5">
            {day.sessions.length === 0 && <div className="text-sm text-muted">—</div>}
            {day.sessions.map((s, i) => (
              <details key={i} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2">
                  <span aria-hidden>{TYPE_ICON[s.type] ?? "•"}</span>
                  <span className={`min-w-0 flex-1 text-sm ${s.hard ? "font-bold" : "font-medium"} ${s.status === "done" ? "text-muted line-through" : ""}`}>{s.title}</span>
                  <Status status={s.status} />
                </summary>
                <p className="mt-1 pl-6 text-xs text-muted">
                  {s.detail}
                  {s.activityId && (
                    <>
                      {" "}
                      <Link href={`/session/${s.activityId}`} className="text-accent">
                        See the session →
                      </Link>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Status({ status }: { status: string }) {
  if (status === "done") return <span className="text-sm font-bold text-good" aria-label="done">✓</span>;
  if (status === "missed") return <span className="text-sm text-muted" aria-label="missed">✕</span>;
  if (status === "today") return <span className="rounded-full bg-accent px-1.5 text-[10px] font-extrabold text-bg">TODAY</span>;
  return null;
}

function Paces({ d }: { d: Data }) {
  const p = d.paces;
  const singles = d.goals?.singles;
  return (
    <section id="paces" className="card space-y-3">
      <div>
        <div className="label">Your paces</div>
        <p className="text-xs text-muted">{d.source ? `From your ${d.source.label}` : "Log a 5K to set your paces"}{d.source ? ` · 5K ${formatDuration(d.source.fiveK)}` : ""}</p>
      </div>
      {p && (
        <ul className="tabular divide-y divide-border text-sm">
          {[
            ["Easy / long", p.easy, "most of your running — conversational"],
            ["Marathon", p.marathon, "long-run finishes"],
            ["Threshold", p.threshold, "the key session — comfortably hard"],
            ["Interval", p.interval, "VO2 reps, 3–5 min"],
            ...(singles ? [["HYROX goal km", formatPace(singles.kmPace), `sub-${Math.round(singles.goal / 60)} singles race pace`]] : []),
          ].map(([name, pace, what]) => (
            <li key={name} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{name}</b> <span className="text-xs text-muted">· {what}</span>
              </span>
              <span className="shrink-0 font-bold">{pace}/km</span>
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
            Fastest 5K inside a run on Strava (last 60 days): <b className="tabular">{formatDuration(d.stravaFiveK.seconds)}</b> on {fmtDay(d.stravaFiveK.date)}. Type it in above if it was a true all-out effort.
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
      <p className="text-xs text-muted">The plan schedules a 5K test after each lighter week. Every test resets all paces here and across the app.</p>
    </section>
  );
}

function Approach() {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">How the plan works</summary>
      <ul className="mt-2 space-y-1.5 text-sm text-muted">
        <li>· <b className="text-text">Mostly easy.</b> About 80% of your running is conversational. That's what lets the volume climb without getting hurt — more important at 95 kg.</li>
        <li>· <b className="text-text">Volume ramps ~10% a week</b>, with every 4th week lighter so you absorb the work.</li>
        <li>· <b className="text-text">The BikeErg adds aerobic work without impact.</b> Zone 2 rides build the same engine as easy running; bike intervals give a VO2 hit on weeks your legs need a break from run intervals.</li>
        <li>· <b className="text-text">Threshold every week</b> — the single best session for HYROX running, growing from 20 to 30–40 minutes.</li>
        <li>· <b className="text-text">HYROX-specific work builds up:</b> strength and stations → compromised running → half and full sims at goal pace.</li>
        <li>· <b className="text-text">5K tests every 4 weeks</b> keep your paces honest as you get fitter.</li>
        <li>· <b className="text-text">Listen to Today:</b> if recovery says easy on a hard day, swap with the next easy day rather than forcing it.</li>
      </ul>
    </details>
  );
}

function Setup({ d }: { d: Data }) {
  const startKm = d.defaults.startKm >= 10 ? d.defaults.startKm : 28;
  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div>
        <h1 className="text-2xl font-extrabold">Plan</h1>
        <p className="text-sm text-muted">A structured block to run faster: more running volume, BikeErg for extra aerobic work, paces from your 5K.</p>
      </div>
      <form action={savePlan} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Singles goal (${d.defaults.singlesDivision})`} name="goal_singles" value="65:00" />
          <Field label={`Doubles goal (${d.defaults.doublesDivision})`} name="goal_doubles" value="60:00" />
        </div>
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
          Your paces come from {d.source ? `your ${d.source.label} (5K ${formatDuration(d.source.fiveK)})` : "a 5K test — the plan starts with one"}. Peak km is capped at double what you run now.
        </p>
        <button className="btn-primary w-full">Build my plan</button>
      </form>
      <Approach />
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
