import Link from "next/link";
import { confirmRace } from "@/app/actions";
import { bestAndWorst, stationTime, vsThreshold } from "@/components/hyroxView";
import RacePatch from "@/components/RacePatch";
import { racePlace } from "@/lib/raceCountry";
import { formatDuration, formatPace } from "@/lib/analysis";
import { hyroxSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

/** One bubble per category you've raced; tap for the full breakdown. */
export default async function Hyrox() {
  const d = await hyroxSummary();
  const thr = d.threshold?.pace ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">HYROX</h1>
          <p className="text-sm text-muted">Latest result in each category{thr ? ` · threshold ${formatPace(thr)}/km` : ""}</p>
        </div>
        <Link href="/log/hyrox" className="btn-primary text-sm">+ Add race</Link>
      </div>

      {d.possibleRaces.length > 0 && (
        <section className="card space-y-1.5 py-3">
          <div className="text-sm font-semibold">Was this a HYROX race?</div>
          {d.possibleRaces.slice(0, 2).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {r.name} · {fmtDate(r.date)} · <span className="tabular">{formatDuration(r.total)}</span>
              </span>
              {/* One form per answer: a clicked button's name/value isn't sent with a server action. */}
              <span className="flex gap-1.5">
                {(["race", "training"] as const).map((answer) => (
                  <form key={answer} action={confirmRace}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="answer" value={answer} />
                    <button className="btn-ghost px-3 py-1 text-xs">{answer === "race" ? "Race" : "Training"}</button>
                  </form>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}

      {d.categories.length === 0 ? (
        <div className="card text-sm text-muted">
          No results yet. Tap <b>+ Add race</b> — a screenshot of the results page fills in the splits for you.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {d.categories.map((c) => {
            const e = c.entries[0];
            const st = stationTime(e);
            const best = Math.min(...c.entries.map((x) => x.total));
            const bw = bestAndWorst(e, c.division);
            return (
              <li key={c.division}>
                <Link href={`/hyrox/${c.division}`} className="card flex h-full flex-col gap-2 p-3.5 transition hover:border-accent active:scale-[0.98]">
                  <div className="flex items-center gap-2.5">
                    <RacePatch name={e.name} date={e.date} size={54} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase leading-tight tracking-wide text-accent">{c.label.replace(/ (Men|Women|Mixed)$/, "")}</div>
                      <div className="text-[11px] font-semibold leading-tight">{c.label.match(/(Men|Women|Mixed)$/)?.[0]}</div>
                      <div className="truncate text-[11px] text-muted">
                        {racePlace(e.name).city} · {fmtDate(e.date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="tabular text-2xl font-extrabold leading-none">{formatDuration(e.total)}</span>
                    {e.total === best && c.entries.length > 1 && <span className="rounded bg-good/15 px-1 text-[10px] font-bold text-good">PB</span>}
                  </div>
                  <div className="tabular grid grid-cols-2 gap-1.5 text-center">
                    <div className="rounded-lg bg-bg px-1 py-1.5">
                      <div className="text-[10px] uppercase text-muted">Run</div>
                      <div className="text-sm font-bold">{e.runAvg ? formatPace(e.runAvg) : "–"}</div>
                      {e.runAvg && thr ? <div className="text-[10px]" style={{ color: e.runAvg - thr > thr * 0.06 ? "var(--warn)" : "var(--good)" }}>{vsThreshold(e.runAvg, thr)}</div> : <div className="text-[10px] text-muted">/km</div>}
                    </div>
                    <div className="rounded-lg bg-bg px-1 py-1.5">
                      <div className="text-[10px] uppercase text-muted">Stations</div>
                      <div className="text-sm font-bold">{st ? formatDuration(st.time) : "–"}</div>
                      <div className="text-[10px] text-muted">{st ? "incl. Roxzone" : "add run pace"}</div>
                    </div>
                  </div>
                  {!bw && <div className="mt-auto text-[11px] text-muted">Add splits to see best and worst station</div>}
                  {bw && (
                    <div className="mt-auto space-y-0.5 text-[11px]">
                      <div className="flex justify-between gap-1">
                        <span className="text-muted">Best</span>
                        <span className="truncate font-semibold text-good">{bw.best.name}</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-muted">Worst</span>
                        <span className="truncate font-semibold text-warn">{bw.worst.name}</span>
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
