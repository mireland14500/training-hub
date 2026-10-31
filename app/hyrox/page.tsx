import Link from "next/link";
import { confirmRace, saveHyroxRunInfo } from "@/app/actions";
import { formatDuration, formatPace } from "@/lib/analysis";
import { hyroxSummary, type HyroxEntry } from "@/lib/data";
import { DIVISIONS } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "+13 s" / "−4 s" against threshold. */
function vs(pace: number, threshold: number) {
  const d = Math.round(pace - threshold);
  return d === 0 ? "at threshold" : `${d > 0 ? "+" : "−"}${Math.abs(d)} s`;
}

function verdict(e: HyroxEntry, threshold: number) {
  const d = e.runAvg! - threshold;
  const pct = Math.round((d / threshold) * 100);
  if (d <= 0) return "You ran your HYROX kms at or faster than threshold pace — that's strong running. The time to find is in the stations and Roxzone.";
  if (pct <= 6) return `Within ${pct}% of threshold — well-paced HYROX running. Raising your threshold is now the main way to run faster.`;
  return `${pct}% slower than threshold. Running off the stations is costing you — compromised-running sessions (1 km straight off sleds, wall balls, lunges) are the fix.`;
}

export default async function Hyrox() {
  const d = await hyroxSummary();
  const e = d.latest;
  const thr = d.threshold;

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">HYROX</h1>
          <p className="text-sm text-muted">Your latest result and how you ran it</p>
        </div>
        <Link href="/log/hyrox" className="btn-primary text-sm">+ Result</Link>
      </div>

      {d.possibleRaces.length > 0 && (
        <section className="card space-y-2">
          <div className="label">Were these HYROX races?</div>
          <ul className="divide-y divide-border">
            {d.possibleRaces.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {fmtDate(r.date)} · {r.name} · <span className="tabular">{formatDuration(r.total)}</span>
                </span>
                {/* One form per answer: a clicked button's name/value isn't sent with a server action. */}
                <span className="flex gap-2">
                  {(["race", "training"] as const).map((answer) => (
                    <form key={answer} action={confirmRace}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="answer" value={answer} />
                      <button className="btn-ghost px-3 py-1 text-xs">{answer === "race" ? "Race" : "Training"}</button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!e ? (
        <div className="card text-sm text-muted">
          No results yet. Log one with <Link href="/log/hyrox" className="text-accent">+ Result</Link> (a photo of the results page works), or confirm a race from Strava above.
        </div>
      ) : (
        <>
          <section className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {e.kind} · {DIVISIONS[e.division]} · {fmtDate(e.date)}
                </div>
                <Link href={`/session/${e.id}`} className="block truncate font-bold hover:text-accent">{e.name}</Link>
              </div>
              <div className="tabular shrink-0 text-3xl font-extrabold">{formatDuration(e.total)}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile label="Avg run" value={e.runAvg ? `${formatPace(e.runAvg)}` : "–"} sub={e.runAvg ? (e.runFromInput ? "/km · entered" : "/km · from splits") : "add below"} />
              <Tile label="Threshold" value={thr ? formatPace(thr.pace) : "–"} sub={thr ? "/km" : "sync Garmin"} />
              <Tile label="Difference" value={e.runAvg && thr ? vs(e.runAvg, thr.pace) : "–"} sub={e.runAvg && thr ? `${e.runAvg > thr.pace ? "slower" : "faster"} per km` : ""} accent={e.runAvg && thr ? (e.runAvg - thr.pace > thr.pace * 0.06 ? "var(--warn)" : "var(--good)") : undefined} />
            </div>
            {e.runAvg && thr && <p className="text-sm">{verdict(e, thr.pace)}</p>}
            {thr && <p className="text-xs text-muted">Threshold from {thr.source}.</p>}

            {!e.runs && (
              <form action={saveHyroxRunInfo} className="space-y-2 rounded-xl bg-bg p-3">
                <div className="text-sm font-semibold">{e.runAvg ? "Update" : "Add"} your average run split</div>
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
          </section>

          {e.runs && thr && <RunSplits runs={e.runs} threshold={thr.pace} />}

          {e.stations && (
            <section className="card">
              <div className="label mb-1">Stations</div>
              <ul className="tabular divide-y divide-border text-sm">
                {e.stations.map((s) => (
                  <li key={s.name} className="flex justify-between py-1.5">
                    <span>{s.name}</span>
                    <b>{formatDuration(s.time)}</b>
                  </li>
                ))}
                {e.roxzone ? (
                  <li className="flex justify-between py-1.5 text-muted">
                    <span>Roxzone (transitions)</span>
                    <span>{formatDuration(e.roxzone)}</span>
                  </li>
                ) : null}
              </ul>
            </section>
          )}
        </>
      )}

      {d.history.length > 1 && (
        <section className="card">
          <div className="label mb-1">Previous results</div>
          <ul className="divide-y divide-border">
            {d.history.slice(1).map((h) => (
              <li key={h.id}>
                <Link href={`/session/${h.id}`} className="grid grid-cols-[1fr_auto_4.2rem] items-center gap-3 py-2 text-sm hover:text-accent">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{h.name}</span>
                    <span className="text-xs text-muted">
                      {fmtDate(h.date)} · {h.kind} · {DIVISIONS[h.division]}
                    </span>
                  </span>
                  <span className="tabular text-right font-bold">{formatDuration(h.total)}</span>
                  <span className="tabular text-right text-xs text-muted">{h.runAvg ? `${formatPace(h.runAvg)}/km` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-bg p-2.5">
      <div className="text-[11px] font-semibold uppercase text-muted">{label}</div>
      <div className="tabular mt-0.5 text-xl font-extrabold" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

/** Each 1 km split against threshold pace: bar left of the line = faster, right = slower. */
function RunSplits({ runs, threshold }: { runs: number[]; threshold: number }) {
  const max = Math.max(20, ...runs.map((r) => Math.abs(r - threshold)));
  const half = Math.floor(runs.length / 2);
  const early = runs.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const late = runs.slice(half).reduce((a, b) => a + b, 0) / (runs.length - half);
  return (
    <section className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="label">Run splits vs threshold</div>
        <span className="tabular text-xs text-muted">threshold {formatPace(threshold)}/km</span>
      </div>
      <ul className="tabular space-y-1.5 text-sm">
        {runs.map((r, i) => {
          const d = r - threshold;
          const w = (Math.abs(d) / max) * 50;
          return (
            <li key={i} className="grid grid-cols-[3rem_1fr_3rem_3.2rem] items-center gap-2">
              <span className="text-muted">Run {i + 1}</span>
              <span className="relative h-2.5 rounded-full bg-border">
                <span className="absolute inset-y-0 left-1/2 w-px bg-muted" />
                <span className="absolute inset-y-0 rounded-full" style={{ background: d > 0 ? "var(--warn)" : "var(--good)", width: `${w}%`, left: d > 0 ? "50%" : `${50 - w}%` }} />
              </span>
              <span className="text-right font-semibold">{formatPace(r)}</span>
              <span className="text-right text-xs text-muted">{vs(r, threshold)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Runs 1–{half} averaged {formatPace(early)}/km, runs {half + 1}–{runs.length} {formatPace(late)}/km
        {late - early > 10 ? ` — ${Math.round(late - early)} s/km of fade.` : " — well held."}
      </p>
    </section>
  );
}
