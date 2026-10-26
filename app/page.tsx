import Link from "next/link";
import BandSparkline from "@/components/BandSparkline";
import SyncButton from "@/components/SyncButton";
import { loadBodyPlan } from "@/lib/bodyplan";
import Countdown from "@/components/Countdown";
import { todayData } from "@/lib/data";
import type { Verdict } from "@/lib/plan";
import type { Call, MetricStatus } from "@/lib/recovery";

export const dynamic = "force-dynamic";

const CALL_STYLE: Record<Call, { badge: string; bg: string; border: string; text: string }> = {
  push: { badge: "PUSH", bg: "color-mix(in srgb, var(--good) 12%, var(--card))", border: "color-mix(in srgb, var(--good) 45%, transparent)", text: "var(--good)" },
  easy: { badge: "EASY", bg: "color-mix(in srgb, var(--c-run) 12%, var(--card))", border: "color-mix(in srgb, var(--c-run) 45%, transparent)", text: "var(--c-run)" },
  rest: { badge: "REST", bg: "color-mix(in srgb, var(--warn) 12%, var(--card))", border: "color-mix(in srgb, var(--warn) 45%, transparent)", text: "var(--warn)" },
};

const VERDICT: Record<Verdict, string> = {
  add: "ADD 1 SESSION",
  maintain: "HOLD",
  reduce: "EASE OFF",
  deload: "LIGHTER WEEK",
  taper: "TAPER",
  rest: "REST",
  return: "BUILD BACK",
};

const STATUS_COLOR = { good: "var(--good)", ok: "var(--warn)", low: "var(--bad)" } as const;
const ACTION_ICON = { add: "+", drop: "−", swap: "⇄", keep: "✓" };

function Tile({ m, suffix }: { m: MetricStatus | undefined; suffix?: string }) {
  if (!m) return null;
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase text-muted">{m.label.replace(" (ms)", "")}</div>
      <div className="tabular mt-1 text-2xl font-extrabold">{m.today ?? "–"}{m.today != null && suffix ? <span className="text-sm font-normal text-muted"> {suffix}</span> : null}</div>
      <div className="text-xs" style={{ color: m.status ? STATUS_COLOR[m.status] : "var(--muted)" }}>{m.note || "No data"}</div>
    </div>
  );
}

export default async function Today() {
  const d = await todayData();
  const plan = await loadBodyPlan(d.call.call).catch(() => null);

  if (!d.stravaConnected && !d.hasActivities) {
    return (
      <div className="card mx-auto mt-10 max-w-md text-center">
        <h1 className="text-xl font-bold">Welcome</h1>
        <p className="mt-2 text-muted">Connect Strava to import your runs, then run the Garmin sync for your recovery data.</p>
        <a href="/api/strava/connect" className="btn-primary mt-4">Connect with Strava</a>
      </div>
    );
  }

  const style = CALL_STYLE[d.call.call];
  const hrv = d.metrics.find((m) => m.key === "hrv");
  const get = (k: MetricStatus["key"]) => d.metrics.find((m) => m.key === k);
  const p = d.plan;
  const max = Math.max(p.target.high * 1.15, p.weekSoFar, 1);
  const pct = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: process.env.APP_TIMEZONE || "UTC" });

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Today</h1>
          <p className="text-sm text-muted">
            {dateLabel}
            {d.lastGarmin ? ` · Garmin ${new Date(d.lastGarmin).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : " · Garmin not synced"}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <SyncButton />
          <Link href="/settings" className="btn-ghost px-3 text-sm md:hidden" aria-label="Settings">⚙︎</Link>
        </div>
      </div>

      {plan?.nextRace && (Date.parse(plan.nextRace.date) - Date.parse(plan.today)) / 86400_000 <= 21 && (
        <Link href={`/race/${plan.nextRace.id}`} className="card flex items-center justify-between gap-3 border-accent hover:bg-accent/5">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{plan.nextRace.name}</div>
            <Countdown date={plan.nextRace.date} startTime={plan.nextRace.start_time ?? null} size="sm" />
          </div>
          <span className="shrink-0 text-sm font-semibold text-accent">Fuel plan →</span>
        </Link>
      )}

      <section className="rounded-2xl border p-4" style={{ background: style.bg, borderColor: style.border }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-bg" style={{ background: style.text }}>{style.badge}</span>
          <span className="text-sm text-muted">{d.call.reasons[0]}</span>
        </div>
        <h2 className="mt-2 text-[22px] font-bold leading-tight">{d.call.headline}</h2>
        <div className="mt-3 rounded-xl bg-bg p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested</div>
          <div className="mt-0.5 font-bold">{d.call.session}</div>
        </div>
        {d.call.reasons.length > 1 && (
          <ul className="mt-2 space-y-0.5 text-sm text-muted">
            {d.call.reasons.slice(1).map((r) => <li key={r}>· {r}</li>)}
          </ul>
        )}
      </section>

      {plan?.ready && (plan.goal || plan.races.length > 0) && (
        <Link href="/body" className="card flex items-center justify-between gap-3 hover:border-accent">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Fuel</div>
            <div className="font-semibold">{plan.fuel.headline}</div>
            <div className="text-xs text-muted">
              {plan.status ? `${plan.status.status === "behind" ? "Behind plan" : plan.status.status === "ahead" ? "Ahead of plan" : "On track"} · 7-day avg ${plan.status.avg} kg` : ""}
              {plan.status && !plan.weighedToday ? " · " : ""}
              {!plan.weighedToday ? "Not weighed in today" : ""}
            </div>
          </div>
          <span className="text-muted">→</span>
        </Link>
      )}

      <section className="card">
        <div className="flex items-baseline justify-between">
          <div className="label">HRV · last 14 nights</div>
          <div className="text-sm font-semibold" style={{ color: hrv?.status ? STATUS_COLOR[hrv.status] : "var(--muted)" }}>
            {hrv?.status === "good" ? "Balanced" : hrv?.status === "ok" ? "Slightly low" : hrv?.status === "low" ? "Low" : ""}
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular text-3xl font-extrabold">{hrv?.today ?? "–"}</span>
          <span className="text-sm text-muted">ms last night{hrv?.range ? ` · normal ${hrv.range[0]}–${hrv.range[1]}` : ""}</span>
        </div>
        <div className="mt-2">
          <BandSparkline points={hrv?.series.map((x) => x.value) ?? []} band={hrv?.range ?? null} label="Overnight HRV for the last 14 nights with your normal range shaded" />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <Tile m={get("rhr")} suffix="bpm" />
        <Tile m={get("sleep")} />
        <Tile m={get("bodyBattery")} />
      </div>
      {!d.hasCheckin && (
        <p className="text-center text-xs text-muted">
          No recovery data for today yet — run <code>npm run garmin</code>, or <Link href="/checkin" className="text-accent">enter it by hand</Link>.
        </p>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="label">This week</div>
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "color-mix(in srgb, var(--c-run) 18%, transparent)", color: "var(--c-run)" }}>{VERDICT[p.verdict]}</span>
        </div>
        <p className="text-[15px] leading-snug">{p.reasons[0] ?? p.headline}</p>
        <div>
          <div className="flex justify-between text-xs text-muted">
            <span>Load so far <b className="tabular text-text">{p.weekSoFar}</b></span>
            <span className="tabular">target {p.target.low}–{p.target.high} · {p.daysLeft} day{p.daysLeft === 1 ? "" : "s"} left</span>
          </div>
          <div className="relative mt-1.5 h-2.5 rounded-full bg-border">
            <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: pct(p.target.low), width: `calc(${pct(p.target.high)} - ${pct(p.target.low)})`, background: "var(--c-run)" }} />
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(p.weekSoFar), background: "var(--c-run)" }} />
          </div>
        </div>
        {p.suggestions.slice(0, 2).map((s) => (
          <div key={s.session} className="flex gap-2.5 rounded-xl bg-bg px-3 py-2.5">
            <span className="w-3 font-extrabold" style={{ color: "var(--c-run)" }}>{ACTION_ICON[s.action]}</span>
            <div>
              <div className="text-sm font-semibold">{s.session}</div>
              <div className="text-xs text-muted">{s.why}</div>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {p.mix.map((m) => (
            <span key={m.label} className="tabular rounded-full border px-2.5 py-1" style={{ borderColor: m.status === "low" ? "var(--warn)" : "var(--border)" }}>
              {m.label.replace(/ \(.*\)$/, "")} {m.label.startsWith("Easy share") ? `${m.count}%` : `${m.count}`}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted">Session counts are for the last 14 days.</p>
        {d.goal && (
          <p className="border-t border-border pt-2 text-sm text-muted">
            <b className="text-text">{d.goal.daysTo} days</b> to {d.goal.name}
          </p>
        )}
      </section>
    </div>
  );
}
