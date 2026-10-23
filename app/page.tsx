import Link from "next/link";
import { PmcChart, WeeklyLoadChart, WellnessChart } from "@/components/Charts";
import SyncButton from "@/components/SyncButton";
import { formatDuration, HR_ZONE_NAMES } from "@/lib/analysis";
import { dashboardData, localDate } from "@/lib/data";
import type { PlanAdvice, Verdict } from "@/lib/plan";

export const dynamic = "force-dynamic";

const LABEL_COLOR = { Primed: "var(--good)", Ready: "var(--good)", Moderate: "var(--warn)", Recover: "var(--bad)" } as const;

function Ring({ score, color }: { score: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
    </svg>
  );
}

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  add: { label: "ADD", color: "var(--good)" },
  maintain: { label: "HOLD", color: "var(--c-ctl)" },
  reduce: { label: "REDUCE", color: "var(--warn)" },
  deload: { label: "DELOAD", color: "var(--bad)" },
  taper: { label: "TAPER", color: "var(--c-ski)" },
  rest: { label: "REST", color: "var(--c-other)" },
  return: { label: "BUILD BACK", color: "var(--c-ski)" },
};
const ACTION_ICON = { add: "＋", drop: "−", swap: "⇄", keep: "✓" };

function PlanCard({ plan }: { plan: PlanAdvice }) {
  const v = VERDICT[plan.verdict];
  const max = Math.max(plan.target.high * 1.15, plan.weekSoFar);
  const pct = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <div className="label">This week</div>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: v.color }}>{v.label}</span>
      </div>
      <div className="mt-1 text-lg font-bold">{plan.headline}</div>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {plan.reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <ul className="mt-3 space-y-2">
        {plan.suggestions.map((s) => (
          <li key={s.session} className="flex gap-2 rounded-xl bg-bg p-2.5 text-sm">
            <span className="w-4 shrink-0 text-center font-bold" style={{ color: v.color }}>{ACTION_ICON[s.action]}</span>
            <div>
              <div className="font-semibold">{s.session}</div>
              <div className="text-xs text-muted">{s.why}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted">
          <span>Weekly load so far: <b className="tabular text-text">{plan.weekSoFar}</b></span>
          <span className="tabular">target {plan.target.low}–{plan.target.high} · {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"} left</span>
        </div>
        <div className="relative mt-1 h-2.5 rounded-full bg-border">
          <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: pct(plan.target.low), width: `calc(${pct(plan.target.high)} - ${pct(plan.target.low)})`, background: v.color }} />
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(plan.weekSoFar), background: v.color }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const d = await dashboardData();

  if (!d.stravaConnected && !d.hasActivities) {
    return (
      <div className="card mx-auto mt-10 max-w-md text-center">
        <h1 className="text-xl font-bold">Welcome 👋</h1>
        <p className="mt-2 text-muted">Connect Strava to import your Garmin runs, then log SkiErg sessions from a photo.</p>
        <a href="/api/strava/connect" className="btn-primary mt-4">Connect with Strava</a>
      </div>
    );
  }

  const tsb = d.today?.tsb ?? 0;
  const acwrTone = d.acwr === null ? undefined : d.acwr > 1.5 ? "var(--bad)" : d.acwr > 1.3 || d.acwr < 0.8 ? "var(--warn)" : "var(--good)";
  const zoneTotal = d.zones.reduce((a, b) => a + b, 0);
  const zoneColors = ["#94a3b8", "var(--c-run)", "var(--good)", "var(--warn)", "var(--bad)"];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-sm text-muted">{d.lastSync ? `Synced ${new Date(d.lastSync).toLocaleString()}` : "Not synced yet"}</p>
        </div>
        <div className="flex items-start gap-2">
          <SyncButton />
          <Link href="/settings" className="btn-ghost px-3 text-sm md:hidden" aria-label="Settings">⚙︎</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="card flex items-center gap-4">
          <div className="relative">
            <Ring score={d.readiness.score} color={LABEL_COLOR[d.readiness.label]} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-3xl font-bold">{d.readiness.score}</span>
              <span className="text-xs font-semibold" style={{ color: LABEL_COLOR[d.readiness.label] }}>{d.readiness.label}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="label">Readiness today</div>
            {d.readiness.factors.map((f) => (
              <div key={f.name} className="flex justify-between gap-2 text-sm">
                <span className="truncate text-muted">{f.name}</span>
                <span className="tabular">{f.detail}</span>
              </div>
            ))}
            {!d.checkedInToday && (
              <Link href="/checkin" className="btn-primary mt-2 w-full text-sm">Morning check-in</Link>
            )}
          </div>
        </div>

        <PlanCard plan={d.plan} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Link href="/hyrox" className="card block transition hover:border-accent">
          <div className="label">Predicted HYROX time</div>
          <div className="tabular mt-1 text-4xl font-bold">{formatDuration(d.prediction.total)}</div>
          <div className="tabular text-sm text-muted">range {formatDuration(d.prediction.low)} – {formatDuration(d.prediction.high)}</div>
          {d.hyroxPb && (
            <div className="tabular mt-1 text-sm">
              Your best <b className="text-good">{formatDuration(d.hyroxPb.total)}</b> <span className="text-muted">({d.hyroxPb.date})</span>
            </div>
          )}
          <div className="mt-2 text-xs text-muted">{Math.round(d.prediction.confidence * 100)}% from your own data · see breakdown →</div>
        </Link>
        <div className="card">
          <div className="label mb-2">Today</div>
          <ul className="space-y-2">
            {d.cues.map((c) => (
              <li key={c} className="flex gap-2 text-sm"><span className="text-accent">●</span>{c}</li>
            ))}
          </ul>
          {d.goal && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
              <b className="text-text">{d.goal.daysTo} days</b> to {d.goal.name} ({d.goal.date})
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Fitness (CTL)" value={String(Math.round(d.today?.ctl ?? 0))} hint="42-day load" />
        <Stat label="Fatigue (ATL)" value={String(Math.round(d.today?.atl ?? 0))} hint="7-day load" />
        <Stat label="Form (TSB)" value={`${tsb > 0 ? "+" : ""}${Math.round(tsb)}`} hint={tsb < -25 ? "Very tired" : tsb < -10 ? "Productive fatigue" : tsb > 15 ? "Very fresh" : "Balanced"} tone={tsb < -25 ? "var(--bad)" : tsb > 5 ? "var(--good)" : undefined} />
        <Stat label="Acute:Chronic" value={d.acwr?.toFixed(2) ?? "–"} hint="Sweet spot 0.8–1.3" tone={acwrTone} />
      </div>

      <div className="card">
        <div className="label mb-2">Session mix — last 14 days</div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {d.plan.mix.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-2 text-sm">
              <span>{m.label}</span>
              <span className="tabular flex items-center gap-2">
                <b>{m.count}</b>
                <span className="text-xs text-muted">aim {m.ideal[0]}–{m.ideal[1]}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: m.status === "ok" ? "var(--good)" : "var(--warn)" }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="label mb-2">Fitness · Fatigue · Form — last 90 days</div>
        <PmcChart data={d.pmc} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Weekly load by sport</div>
          <WeeklyLoadChart data={d.weekly} />
        </div>
        <div className="card">
          <div className="label mb-2">Intensity split — last 28 days (HR zones)</div>
          {zoneTotal > 0 ? (
            <>
              <div className="flex h-4 overflow-hidden rounded-full">
                {d.zones.map((z, i) => (
                  <div key={i} style={{ width: `${(z / zoneTotal) * 100}%`, background: zoneColors[i] }} />
                ))}
              </div>
              <div className="mt-3 space-y-1">
                {d.zones.map((z, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: zoneColors[i] }} />{HR_ZONE_NAMES[i]}</span>
                    <span className="tabular text-muted">{Math.floor(z / 60)}h {z % 60}m · {Math.round((z / zoneTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Polarised target: ~80% in Z1–Z2.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Sync activities with heart rate to see your zone split.</p>
          )}
        </div>
      </div>

      {d.wellness.length > 1 && (
        <div className="card">
          <div className="label mb-2">Garmin wellness trend (from check-ins)</div>
          <WellnessChart data={d.wellness} />
        </div>
      )}

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <div className="label">Recent sessions</div>
          <Link href="/calendar" className="text-sm text-accent">Calendar</Link>
        </div>
        <ul className="divide-y divide-border">
          {d.recent.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <Link href={`/session/${a.id}`} className="block truncate font-medium hover:text-accent">{a.name}</Link>
                <div className="text-xs text-muted">{localDate(a.start_time)} · {a.sport} · {formatDuration(a.moving_s ?? a.duration_s)}</div>
              </div>
              <div className="tabular shrink-0 text-right">
                <div className="font-semibold">{Math.round(a.load ?? 0)}</div>
                <div className="text-xs text-muted">load</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
