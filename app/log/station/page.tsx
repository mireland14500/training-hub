import { saveBenchmark } from "@/app/actions";
import { getAthlete } from "@/lib/db";
import { today } from "@/lib/data";
import { DIVISIONS, STATIONS, type Division } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

const LOAD_HINT: Record<string, string> = {
  sled_push: "Sled + plates total",
  sled_pull: "Sled + plates total",
  farmers: "Per hand",
  lunges: "Sandbag",
  wall_balls: "Ball",
};

export default async function StationBenchmark({ searchParams }: { searchParams: Promise<{ saved?: string; station?: string }> }) {
  const sp = await searchParams;
  const athlete = await getAthlete();
  const division = athlete.hyrox_division as Division;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Station benchmark</h1>
        <p className="text-sm text-muted">
          Log a timed station effort from training. Shorter distances, fewer reps or lighter weights are scaled to {DIVISIONS[division]} race standard.
        </p>
      </div>
      {sp.saved && <p className="rounded-xl bg-good/15 p-3 text-sm text-good">Saved. Add another?</p>}
      <form action={saveBenchmark} className="card space-y-3">
        <label className="block">
          <span className="label">Station</span>
          <select name="station" className="input mt-1" defaultValue={sp.station ?? "wall_balls"}>
            {STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.load[division] ? ` (race: ${s.load[division]} kg)` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="label">Time *</span>
            <input className="input tabular mt-1" name="time" placeholder="m:ss" required />
          </label>
          <label className="block">
            <span className="label">m / reps</span>
            <input className="input tabular mt-1" name="amount" inputMode="decimal" placeholder="race" />
          </label>
          <label className="block">
            <span className="label">Weight kg</span>
            <input className="input tabular mt-1" name="load_kg" inputMode="decimal" placeholder="race" />
          </label>
        </div>
        <p className="text-xs text-muted">Leave distance/weight blank if you did the race standard. Weight: {Object.entries(LOAD_HINT).map(([k, v]) => `${STATIONS.find((s) => s.key === k)!.name.split(" ").slice(0, 2).join(" ")} = ${v.toLowerCase()}`).join(" · ")}.</p>
        <fieldset>
          <legend className="label">Done…</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className="cursor-pointer">
              <input type="radio" name="fresh" value="yes" defaultChecked className="peer sr-only" />
              <span className="block rounded-xl border border-border py-2.5 text-center text-sm font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white">Fresh</span>
            </label>
            <label className="cursor-pointer">
              <input type="radio" name="fresh" value="no" className="peer sr-only" />
              <span className="block rounded-xl border border-border py-2.5 text-center text-sm font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white">Straight after running</span>
            </label>
          </div>
        </fieldset>
        <label className="block">
          <span className="label">Date</span>
          <input className="input mt-1" type="date" name="date" defaultValue={today()} />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <input className="input mt-1" name="notes" placeholder="e.g. 4 × 12.5 m lengths, carpet" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" name="again" value="1">Save & add another</button>
          <button className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}
