import { deleteBodyGoal, deleteRace, saveBodyGoal, saveRace, saveWeighIn } from "@/app/actions";
import { formatPace } from "@/lib/analysis";
import { paceEffectOfFat } from "@/lib/body";
import { leanFloor, suggestedTarget, weeklyRatePct } from "@/lib/cut";
import type { loadBodyPlan } from "@/lib/bodyplan";
import Link from "next/link";
import WeightPlanChart from "./WeightPlanChart";

type Plan = Awaited<ReturnType<typeof loadBodyPlan>>;

const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400_000).toISOString().slice(0, 10);

const PHASE_STYLE: Record<string, { badge: string; color: string }> = {
  "race-day": { badge: "RACE DAY", color: "var(--accent)" },
  "race-week": { badge: "RACE WEEK", color: "var(--accent)" },
  recover: { badge: "RECOVER", color: "var(--c-run)" },
  deficit: { badge: "DEFICIT", color: "var(--good)" },
  maintain: { badge: "MAINTAIN", color: "var(--muted)" },
};

/** Fuel call for today, the body-fat goal with accountability, and upcoming races. */
export default function BodyPlan({ plan, ltSpeed, sex }: { plan: Plan; ltSpeed: number | null; sex: string }) {
  if (!plan.ready) {
    return (
      <div className="card text-sm">
        The fat-loss plan needs three new tables. Run <code className="rounded bg-bg px-1">supabase/schema.sql</code> in the Supabase SQL Editor, then reload.
      </div>
    );
  }
  const { goal, goalWeight, status, fuel, phase } = plan;
  const style = PHASE_STYLE[phase.phase];
  const ltPace = ltSpeed ? 1000 / ltSpeed : null;
  const now = plan.latestWeight;
  // What reaching the goal is worth: fat off at the same fitness.
  const toLose = goal && goalWeight && now ? Math.max(0, Math.round((now - goalWeight) * 10) / 10) : null;
  const atGoal = toLose && ltPace && goalWeight ? paceEffectOfFat(goalWeight, -toLose, ltPace) : null;
  const perKg = ltPace && now ? paceEffectOfFat(now - 1, -1, ltPace) : null;

  // Goal form defaults: start after the next race's recovery, finish a week before the race after it.
  const next = plan.nextRace;
  const later = plan.races.find((r) => next && r.date > next.date);
  const defStart = next && next.date >= plan.today ? addDays(next.date, 4) : plan.today;
  const defEnd = later ? addDays(later.date, -7) : addDays(defStart, 84);
  const scan = plan.latestScan;
  const suggested = scan ? suggestedTarget({ start_date: defStart, target_date: defEnd, start_weight: scan.weight, start_fat_pct: scan.fatPct }, sex) : null;
  const rate = goal ? weeklyRatePct(goal) : null;

  return (
    <div className="space-y-3.5">
      <section className="rounded-2xl border p-4" style={{ borderColor: style.color, background: `color-mix(in srgb, ${style.color} 8%, var(--card))` }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-wider text-bg" style={{ background: style.color }}>{style.badge}</span>
          <span className="text-xs text-muted">Fuel today</span>
        </div>
        <h2 className="mt-1.5 text-lg font-bold leading-snug">{fuel.headline}</h2>
        <p className="mt-1 text-sm text-muted">{fuel.detail}</p>
        {(phase.phase === "race-week" || phase.phase === "race-day") && phase.race?.id && (
          <Link href={`/race/${phase.race.id}`} className="btn-primary mt-3 w-full text-sm">
            Countdown & carb-load plan →
          </Link>
        )}
        {plan.protein && <p className="mt-2 text-sm"><b className="tabular">{plan.protein} g protein</b> <span className="text-muted">(about 2 g per kg) — keeps the muscle while the fat comes off</span></p>}
      </section>

      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="label">Body-fat goal</div>
          {goal && (
            <form action={deleteBodyGoal}>
              <button className="text-xs text-muted hover:text-bad">Clear goal</button>
            </form>
          )}
        </div>
        {goal && goalWeight ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-extrabold">{goal.start_fat_pct}% → {goal.target_fat_pct}%</span>
              <span className="text-sm text-muted">by {fmtDate(goal.target_date)} · about {goalWeight} kg</span>
            </div>
            {plan.today < goal.start_date ? (
              <p className="text-sm">Starts <b>{fmtDate(goal.start_date)}</b>. Until then, eat to race and recover.</p>
            ) : status ? (
              <p className="text-sm">
                <b style={{ color: status.status === "behind" ? "var(--warn)" : "var(--good)" }}>
                  {status.status === "ahead" ? "Ahead of plan" : status.status === "on-track" ? "On track" : "Behind plan"}
                </b>{" "}
                <span className="text-muted">· 7-day average {status.avg} kg vs plan {status.planned} kg</span>
              </p>
            ) : (
              <p className="text-sm text-muted">Weigh in to start tracking.</p>
            )}
            <WeightPlanChart goal={goal} goalWeight={goalWeight} weighIns={plan.weighIns} races={plan.races} today={plan.today} />
            <p className="text-xs text-muted">
              Dashed: the plan. Blue: your 7-day average (dots are single weigh-ins — daily swings of ±1 kg are water, not fat).
              {rate !== null && (rate > 0.75 ? ` ${rate}% of body weight a week is aggressive and will cost training quality.` : ` ${rate}% of body weight a week: sustainable.`)}
            </p>
            {goal.target_fat_pct < leanFloor(sex) && (
              <p className="text-xs text-warn">Below about {leanFloor(sex)}% body fat, performance, recovery and hormones tend to suffer. Consider a higher target.</p>
            )}
          </>
        ) : (
          <form action={saveBodyGoal} className="space-y-3">
            <p className="text-sm text-muted">
              {scan ? `From your InBody scan on ${fmtDate(scan.date)}: ${scan.weight} kg at ${scan.fatPct}% fat.` : "Add an InBody scan first, or enter your numbers."}{" "}
              The plan keeps your muscle and loses only fat, about 0.5% of body weight a week, with no deficit in race weeks.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight now (kg)" name="start_weight" value={scan?.weight} />
              <Field label="Body fat now (%)" name="start_fat_pct" value={scan?.fatPct} />
              <Field label="Target body fat (%)" name="target_fat_pct" value={suggested ?? undefined} />
              <div />
              <Field label="Start" name="start_date" type="date" value={defStart} />
              <Field label="Target date" name="target_date" type="date" value={defEnd} />
            </div>
            {suggested !== null && (
              <p className="text-xs text-muted">
                Suggested {suggested}%: a gentle 0.5% of body weight a week, at most 3 points per block. You can set a new goal after the race.
              </p>
            )}
            <button className="btn-primary w-full">Set goal</button>
          </form>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-sm">
            <b>{plan.weekCount}/7</b> <span className="text-muted">weigh-ins this week{plan.weekCount < 4 ? " · aim for 4+" : " · nice"}</span>
          </div>
        </div>
        <form action={saveWeighIn} className="flex gap-2">
          <input name="weight_kg" type="number" step="0.1" inputMode="decimal" required placeholder="Weight (kg)" className="input flex-1" aria-label="Today's weight in kg" />
          <button className="btn-primary px-4">{plan.weighedToday ? "Update" : "Log"}</button>
        </form>
        <p className="text-xs text-muted">Same time each day — first thing, after the toilet, before food.</p>
      </section>

      {(atGoal || perKg) && (
        <section className="card space-y-1.5">
          <div className="label">What it&apos;s worth on the run</div>
          {atGoal !== null && toLose ? (
            <p className="text-[15px]">
              Losing <b>{toLose} kg</b> of fat ≈ <b className="text-good">{Math.abs(atGoal)} s/km faster</b> at threshold ({formatPace(ltPace!)} → {formatPace(ltPace! + atGoal)}/km) — about{" "}
              <b>{Math.round(Math.abs(atGoal) * 8)} s</b> across the 8 km of a HYROX.
            </p>
          ) : (
            perKg && <p className="text-[15px]">Each kg of fat off ≈ <b className="text-good">{Math.abs(perKg)} s/km faster</b> at threshold — about {Math.abs(perKg) * 8} s over a HYROX&apos;s 8 km.</p>
          )}
          <p className="text-xs text-muted">Same fitness, less to carry. Burpees, lunges and wall balls get easier too; keeping your muscle matters for the sleds.</p>
        </section>
      )}

      <section className="card space-y-2">
        <div className="label">Upcoming races</div>
        {plan.races.length > 0 && (
          <ul className="divide-y divide-border">
            {plan.races.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/race/${r.id}`} className="min-w-0 hover:text-accent">
                  <b>{r.name}</b>{" "}
                  <span className="text-muted">
                    · {fmtDate(r.date)}
                    {r.start_time ? ` · ${r.start_time}` : ""}
                  </span>{" "}
                  <span className="text-xs text-accent">countdown & fuel plan →</span>
                </Link>
                <form action={deleteRace}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-muted hover:text-bad" aria-label={`Remove ${r.name}`}>✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveRace} className="grid grid-cols-[1fr_auto] gap-2">
          <input name="name" required placeholder="e.g. HYROX Dublin" className="input col-span-2" aria-label="Race name" />
          <div className="grid min-w-0 grid-cols-[1fr_6.5rem] gap-2">
            <input name="date" type="date" required className="input min-w-0" aria-label="Race date" />
            <input name="start_time" type="time" className="input min-w-0" aria-label="Wave start time (optional)" />
          </div>
          <button className="btn-ghost px-4">Add race</button>
        </form>
        <p className="text-xs text-muted">No deficit in the 6 days before a race, and 3 recovery days after.</p>
      </section>
    </div>
  );
}

function Field({ label, name, value, type = "number" }: { label: string; name: string; value?: number | string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input name={name} type={type} step="any" required defaultValue={value} className="input mt-1" inputMode={type === "number" ? "decimal" : undefined} />
    </label>
  );
}
