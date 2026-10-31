import Link from "next/link";
import { confirmRace } from "@/app/actions";
import { stationTime, vsThreshold } from "@/components/hyroxView";
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
            return (
              <li key={c.division}>
                <Link href={`/hyrox/${c.division}`} className="card flex h-full flex-col gap-2 p-3.5 transition hover:border-accent active:scale-[0.98]">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-accent">{c.label}</span>
                    <span className="text-muted" aria-hidden>›</span>
                  </div>
                  <div>
                    <div className="tabular text-2xl font-extrabold leading-none">{formatDuration(e.total)}</div>
                    <div className="mt-1 truncate text-[11px] text-muted">
                      {e.name.replace(/^hyrox\s*/i, "")} · {fmtDate(e.date)}
                      {e.total === best && c.entries.length > 1 ? " · PB" : ""}
                    </div>
                  </div>
                  <div className="tabular mt-auto grid grid-cols-2 gap-1.5 text-center">
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
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
