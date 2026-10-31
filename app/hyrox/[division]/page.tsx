import Link from "next/link";
import { notFound } from "next/navigation";
import { saveHyroxRunInfo } from "@/app/actions";
import { stationTime, vsThreshold } from "@/components/hyroxView";
import { formatDuration, formatPace } from "@/lib/analysis";
import { hyroxSummary, type HyroxEntry } from "@/lib/data";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function verdict(e: HyroxEntry, threshold: number) {
  const d = e.runAvg! - threshold;
  const pct = Math.round((d / threshold) * 100);
  if (d <= 0) return "At or faster than threshold pace — strong running. The time to find is in the stations and Roxzone.";
  if (pct <= 6) return `Within ${pct}% of threshold — well-paced HYROX running. Raising your threshold is the main way to run faster.`;
  return `${pct}% slower than threshold. Running off the stations is costing you — compromised-running sessions are the fix.`;
}

/** Full breakdown for one category: pick a race, see runs vs threshold and stations. */
export default async function HyroxCategory({ params, searchParams }: { params: Promise<{ division: string }>; searchParams: Promise<{ id?: string }> }) {
  const [{ division }, { id }] = await Promise.all([params, searchParams]);
  const d = await hyroxSummary();
  const c = d.categories.find((x) => x.division === division);
  if (!c) notFound();
  const e = c.entries.find((x) => x.id === id) ?? c.entries[0];
  const thr = d.threshold;
  const st = stationTime(e);

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <Link href="/hyrox" className="text-sm text-accent">← All categories</Link>
      <div>
        <h1 className="text-2xl font-extrabold">{c.label}</h1>
        {c.entries.length > 1 && (
          <div className="-mx-4 mt-2 overflow-x-auto px-4">
            <div className="flex gap-1.5">
              {c.entries.map((x) => (
                <Link key={x.id} href={`/hyrox/${division}?id=${x.id}`} scroll={false} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${x.id === e.id ? "border-accent bg-accent/10 font-bold text-accent" : "border-border"}`}>
                  {x.name.replace(/^hyrox\s*/i, "")} · {formatDuration(x.total)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/session/${e.id}`} className="block truncate font-bold hover:text-accent">{e.name}</Link>
            <div className="text-xs text-muted">
              {e.kind} · {fmtDate(e.date)}
            </div>
          </div>
          <div className="tabular shrink-0 text-3xl font-extrabold">{formatDuration(e.total)}</div>
        </div>
        <div className="tabular grid grid-cols-3 gap-2 text-center">
          <Stat label="Avg run" value={e.runAvg ? formatPace(e.runAvg) : "–"} sub={e.runAvg && thr ? `${vsThreshold(e.runAvg, thr.pace)} vs threshold` : "/km"} />
          <Stat label="Runs total" value={e.runs ? formatDuration(e.runs.reduce((a, b) => a + b, 0)) : e.runAvg ? formatDuration(e.runAvg * 8) : "–"} sub="8 × 1 km" />
          <Stat label="Stations" value={st ? formatDuration(st.time) : "–"} sub={e.roxzone ? `incl. ${formatDuration(e.roxzone)} Roxzone` : "incl. Roxzone"} />
        </div>
        {e.runAvg && thr && <p className="text-sm">{verdict(e, thr.pace)}</p>}
      </section>

      {e.runs && thr && <RunSplits runs={e.runs} threshold={thr.pace} />}

      {e.stations && (
        <section className="card">
          <div className="label mb-1">Stations</div>
          <ul className="tabular grid grid-cols-2 gap-x-4 text-sm">
            {e.stations.map((s) => (
              <li key={s.name} className="flex justify-between border-b border-border py-1.5">
                <span className="truncate">{s.name}</span>
                <b>{formatDuration(s.time)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!e.runs && (
        <form action={saveHyroxRunInfo} className="card space-y-2">
          <div className="text-sm font-semibold">No splits for this one — add your average run</div>
          <div className="grid grid-cols-[6rem_1fr_auto] gap-2">
            <input type="hidden" name="id" value={e.id} />
            <input name="run_pace" defaultValue={e.runAvg ? formatPace(e.runAvg) : ""} placeholder="4:18" inputMode="numeric" className="input" aria-label="Average run per km" />
            <select name="division" defaultValue={e.division} className="input min-w-0" aria-label="Category">
              {d.divisions.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button className="btn-primary px-3">Save</button>
          </div>
          <p className="text-xs text-muted">
            Or <Link href="/log/hyrox" className="text-accent">log the full splits</Link> from a screenshot of the results page.
          </p>
        </form>
      )}
      {thr && <p className="text-center text-xs text-muted">Threshold {formatPace(thr.pace)}/km from {thr.source}.</p>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-bg p-2">
      <div className="text-[10px] font-semibold uppercase text-muted">{label}</div>
      <div className="text-lg font-extrabold">{value}</div>
      <div className="text-[10px] leading-tight text-muted">{sub}</div>
    </div>
  );
}

/** Each 1 km split against threshold pace: left of the line = faster, right = slower. */
function RunSplits({ runs, threshold }: { runs: number[]; threshold: number }) {
  const max = Math.max(20, ...runs.map((r) => Math.abs(r - threshold)));
  const half = Math.floor(runs.length / 2);
  const early = runs.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const late = runs.slice(half).reduce((a, b) => a + b, 0) / (runs.length - half);
  return (
    <section className="card space-y-1.5">
      <div className="flex items-baseline justify-between">
        <div className="label">Runs vs threshold</div>
        <span className="tabular text-xs text-muted">{formatPace(threshold)}/km</span>
      </div>
      <ul className="tabular space-y-0.5 text-sm">
        {runs.map((r, i) => {
          const d = r - threshold;
          const w = (Math.abs(d) / max) * 50;
          return (
            <li key={i} className="grid grid-cols-[1.4rem_1fr_2.8rem_2.8rem] items-center gap-2">
              <span className="text-xs text-muted">{i + 1}</span>
              <span className="relative h-2 rounded-full bg-border">
                <span className="absolute inset-y-0 left-1/2 w-px bg-muted" />
                <span className="absolute inset-y-0 rounded-full" style={{ background: d > 0 ? "var(--warn)" : "var(--good)", width: `${w}%`, left: d > 0 ? "50%" : `${50 - w}%` }} />
              </span>
              <span className="text-right font-semibold">{formatPace(r)}</span>
              <span className="text-right text-xs text-muted">{vsThreshold(r, threshold)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Runs 1–{half} {formatPace(early)}/km · runs {half + 1}–{runs.length} {formatPace(late)}/km
        {late - early > 10 ? ` · ${Math.round(late - early)} s/km fade` : " · well held"}
      </p>
    </section>
  );
}
