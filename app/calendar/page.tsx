import Link from "next/link";
import { copySessionDetails, deleteTimeOff, saveTimeOff } from "@/app/actions";
import { CATEGORY_COLOR, CATEGORY_LABEL, FOCUS_LABEL } from "@/components/categories";
import { formatDuration } from "@/lib/analysis";
import { calendarData, todayData, type CalendarSession } from "@/lib/data";

export const dynamic = "force-dynamic";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OFF_LABEL = { ill: "🤒 Ill", injury: "🩹 Injured", holiday: "🌴 Holiday", other: "Off" } as const;

function dayLabel(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function SessionCard({ s }: { s: CalendarSession }) {
  const needsDetails = s.needsDetails;
  return (
    <div>
      <Link
        href={`/session/${s.id}`}
        className={`block rounded-xl border border-border bg-card p-2.5 text-sm transition hover:border-accent ${s.excluded ? "opacity-50" : ""}`}
        style={{ borderLeft: `4px solid ${CATEGORY_COLOR[s.category]}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-semibold leading-tight">{s.name}</div>
          <div className="tabular shrink-0 text-xs font-semibold">{s.load}</div>
        </div>
        <div className="tabular mt-0.5 text-xs text-muted">
          {formatDuration(s.durationS)}
          {s.distanceM ? ` · ${(s.distanceM / 1000).toFixed(1)} km` : ""}
          {s.avgHr ? ` · ${Math.round(s.avgHr)} bpm` : ""}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {s.focus && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{FOCUS_LABEL[s.focus]}</span>}
          {s.hard && !s.focus && <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-semibold text-bad">Hard</span>}
          {s.hasPhoto && <span className="text-[11px]">📷</span>}
        </div>
        {s.summary && <div className="mt-1 line-clamp-2 text-xs text-muted">{s.summary}</div>}
        {needsDetails && !s.suggestion && <div className="mt-1 text-xs font-semibold text-accent">+ Add what you did</div>}
      </Link>
      {s.suggestion && (
        <form action={copySessionDetails} className="mt-1">
          <input type="hidden" name="target" value={s.id} />
          <input type="hidden" name="source" value={s.suggestion.id} />
          <button className="w-full rounded-xl border border-dashed border-accent px-2.5 py-1.5 text-left text-xs">
            <span className="font-semibold text-accent">Same as {dayLabel(s.suggestion.date)}?</span>
            <span className="block truncate text-muted">{s.suggestion.summary}</span>
          </button>
        </form>
      )}
    </div>
  );
}

function Volume({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular font-bold">{value}</div>
    </div>
  );
}

export default async function Calendar({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const d = await calendarData(week);
  const v = d.summary.volumes;
  const volumes = [
    { label: "Running", value: v.runKm, text: `${v.runKm.toFixed(1)} km` },
    { label: "SkiErg", value: v.skiM, text: `${Math.round(v.skiM)} m` },
    { label: "Row", value: v.rowM, text: `${Math.round(v.rowM)} m` },
    { label: "Bike", value: v.bikeKm, text: `${v.bikeKm.toFixed(1)} km` },
    { label: "Sleds", value: v.sledM, text: `${Math.round(v.sledM)} m` },
    { label: "Wall balls", value: v.wallBalls, text: `${v.wallBalls} reps` },
    { label: "Lunges", value: v.lungesM, text: `${Math.round(v.lungesM)} m` },
    { label: "Burpee BJ", value: v.bbjM, text: `${Math.round(v.bbjM)} m` },
    { label: "Carries", value: v.carryM, text: `${Math.round(v.carryM)} m` },
  ].filter((x) => x.value > 0);
  const catTotal = Object.values(d.summary.byCategory).reduce((a, b) => a + b, 0);
  const isThisWeek = d.today >= d.monday && d.today <= d.sunday;
  const todayCall = isThisWeek ? (await todayData()).call : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted">
            {dayLabel(d.monday)} – {dayLabel(d.sunday)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?week=${d.prevWeek}`} className="btn-ghost px-3" aria-label="Previous week">←</Link>
          {!isThisWeek && <Link href="/calendar" className="btn-ghost text-sm">This week</Link>}
          <Link href={`/calendar?week=${d.nextWeek}`} className="btn-ghost px-3" aria-label="Next week">→</Link>
          <Link href="/log" className="btn-ghost text-sm">Log…</Link>
          <Link href={`/session/new?date=${isThisWeek ? d.today : d.monday}`} className="btn-primary text-sm">+ Session</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <Link href={`/calendar?week=${d.prevMonth}`} className="px-2 text-muted" aria-label="Previous month">‹</Link>
            <div className="font-semibold">{d.monthLabel}</div>
            <Link href={`/calendar?week=${d.nextMonth}`} className="px-2 text-muted" aria-label="Next month">›</Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {DOW.map((x) => <div key={x}>{x[0]}</div>)}
          </div>
          <div className="mt-1 space-y-1">
            {d.month.map((row) => {
              const selected = row[0].date === d.monday;
              return (
                <div key={row[0].date} className={`grid grid-cols-7 gap-1 rounded-lg ${selected ? "bg-accent/10 ring-1 ring-accent" : ""}`}>
                  {row.map((c) => (
                    <Link
                      key={c.date}
                      href={`/calendar?week=${c.date}`}
                      className={`flex h-11 flex-col items-center justify-center rounded-lg text-xs hover:bg-bg ${c.inMonth ? "" : "opacity-35"} ${c.date === d.today ? "font-bold text-accent" : ""} ${c.off ? "bg-warn/15" : ""}`}
                    >
                      <span>{Number(c.date.slice(8))}</span>
                      <span className="mt-0.5 flex gap-0.5">
                        {c.categories.slice(0, 4).map((cat, i) => (
                          <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[cat] }} />
                        ))}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
          <details className="mt-3 rounded-xl border border-border p-2 text-sm">
            <summary className="cursor-pointer font-semibold">🤒 Mark time off (ill, injured, holiday)</summary>
            <form action={saveTimeOff} className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] uppercase text-muted">From</span>
                <input className="input mt-0.5 py-1.5" type="date" name="start" defaultValue={d.today} required />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase text-muted">To</span>
                <input className="input mt-0.5 py-1.5" type="date" name="end" defaultValue={d.today} required />
              </label>
              <select name="reason" className="input py-1.5" defaultValue="ill">
                <option value="ill">Ill</option>
                <option value="injury">Injured</option>
                <option value="holiday">Holiday</option>
                <option value="other">Other</option>
              </select>
              <button className="btn-primary py-1.5 text-sm">Save</button>
              <p className="col-span-2 text-xs text-muted">Your weekly plan switches to rest / build-back advice, and the fitness verdict won&apos;t count the dip against you.</p>
            </form>
          </details>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[k] }} />{label}</span>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="label">Week summary</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><div className="tabular text-2xl font-bold">{d.summary.load}</div><div className="text-xs text-muted">load</div></div>
            <div><div className="tabular text-2xl font-bold">{d.summary.sessions}</div><div className="text-xs text-muted">sessions</div></div>
            <div><div className="tabular text-2xl font-bold">{d.summary.hours.toFixed(1)}</div><div className="text-xs text-muted">hours</div></div>
            <div><div className="tabular text-2xl font-bold">{d.summary.hard}</div><div className="text-xs text-muted">hard</div></div>
          </div>
          {catTotal > 0 && (
            <div>
              <div className="flex h-3 overflow-hidden rounded-full">
                {Object.entries(d.summary.byCategory).map(([k, s]) => (
                  <div key={k} title={`${CATEGORY_LABEL[k]} ${formatDuration(s)}`} style={{ width: `${(s / catTotal) * 100}%`, background: CATEGORY_COLOR[k] }} />
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                {Object.entries(d.summary.byCategory).map(([k, s]) => (
                  <span key={k}>{CATEGORY_LABEL[k]} {formatDuration(s).replace(/:\d\d$/, "")}{s >= 3600 ? " h" : " min"}</span>
                ))}
              </div>
            </div>
          )}
          {volumes.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {volumes.map((x) => <Volume key={x.label} label={x.label} value={x.text} />)}
            </div>
          )}
          {d.summary.needsDetails > 0 && (
            <p className="rounded-xl bg-accent/10 p-2.5 text-sm">
              {d.summary.needsDetails} session{d.summary.needsDetails === 1 ? "" : "s"} without details. Tap one to add what you did (or snap the whiteboard) so it counts properly in your analysis.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {d.days.map((day) => (
          <div key={day.date} className={`rounded-2xl p-2 md:min-h-40 ${day.date === d.today ? "bg-accent/5 ring-1 ring-accent/40" : ""}`}>
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <div className={`text-sm font-semibold ${day.date === d.today ? "text-accent" : ""}`}>{dayLabel(day.date)}</div>
              {day.checkin?.hrv && <div className="tabular text-[11px] text-muted" title="Overnight HRV">♥ {day.checkin.hrv}</div>}
            </div>
            {day.off && (
              <form action={deleteTimeOff} className="mb-2 flex items-center justify-between rounded-lg bg-warn/15 px-2 py-1 text-xs">
                <span>{OFF_LABEL[day.off.reason]}</span>
                <input type="hidden" name="id" value={day.off.id} />
                <input type="hidden" name="week" value={d.monday} />
                {day.date === day.off.start && <button className="text-muted hover:text-bad" title="Remove this time off">✕</button>}
              </form>
            )}
            <div className="space-y-2">
              {day.sessions.map((s) => <SessionCard key={s.id} s={s} />)}
              {todayCall && day.date === d.today && (
                <Link href="/" className="block rounded-xl border border-dashed border-accent p-2.5 text-sm hover:bg-accent/5">
                  <span className="text-xs font-bold uppercase text-accent">{todayCall.call} today</span>
                  <span className="mt-0.5 block font-semibold leading-snug">{todayCall.session}</span>
                </Link>
              )}
              <Link href={`/session/new?date=${day.date}`} className="block rounded-xl border border-dashed border-border py-1.5 text-center text-xs text-muted hover:border-accent hover:text-accent">
                + Add
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
