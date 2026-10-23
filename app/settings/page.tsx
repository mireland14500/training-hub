import { reanalyseRuns, saveSettings, applyGarminThresholdHr } from "@/app/actions";
import SyncButton from "@/components/SyncButton";
import { formatDuration, formatPace } from "@/lib/analysis";
import { db, getAthlete } from "@/lib/db";
import { SINGLES_DIVISIONS } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

function Num({ name, label, value, hint }: { name: string; label: string; value: number | string | null; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input tabular mt-1" name={name} defaultValue={value ?? ""} inputMode="decimal" />
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; strava?: string; reanalyse?: string }> }) {
  const sp = await searchParams;
  const [a, { data: strava }] = await Promise.all([getAthlete(), db().from("strava_auth").select("athlete_name, last_sync_at").eq("id", 1).maybeSingle()]);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      {sp.saved && <p className="rounded-xl bg-good/15 p-3 text-sm text-good">Saved. Training loads were recalculated.</p>}
      {sp.strava === "connected" && <p className="rounded-xl bg-good/15 p-3 text-sm text-good">Strava connected — tap Sync to import your history.</p>}

      <div className="card space-y-3">
        <div className="label">Strava</div>
        {strava ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              Connected{strava.athlete_name ? ` as ${strava.athlete_name}` : ""}
              <div className="text-xs text-muted">{strava.last_sync_at ? `Last sync ${new Date(strava.last_sync_at).toLocaleString()}` : "Never synced"}</div>
            </div>
            <SyncButton />
          </div>
        ) : (
          <a href="/api/strava/connect" className="btn-primary w-full">Connect with Strava</a>
        )}
        <p className="text-xs text-muted">Your Garmin uploads to Strava automatically; new activities arrive here through the Strava webhook.</p>
      </div>

      {sp.reanalyse && <p className="rounded-xl bg-good/15 p-3 text-sm text-good">Runs queued for re-analysis — tap Sync Strava a few times (15 min apart if it hits Strava&apos;s limit).</p>}

      <div className="card space-y-3">
        <div className="label">Garmin</div>
        {a.garmin_synced_at ? (
          <>
            <div className="text-sm">
              Last Garmin sync {new Date(a.garmin_synced_at).toLocaleString()}
              {a.garmin_lt_speed && (
                <div className="text-xs text-muted">
                  Lactate threshold {formatPace(1000 / a.garmin_lt_speed)}/km{a.garmin_lt_hr ? ` @ ${a.garmin_lt_hr} bpm` : ""}
                  {a.garmin_vo2max ? ` · VO2max ${a.garmin_vo2max}` : ""}
                </div>
              )}
            </div>
            {a.garmin_lt_hr && a.garmin_lt_hr !== a.threshold_hr && (
              <form action={applyGarminThresholdHr}>
                <button className="btn-ghost w-full whitespace-normal text-sm">Use Garmin threshold HR: {a.garmin_lt_hr} bpm (now {a.threshold_hr})</button>
              </form>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            Not connected. Run <code className="rounded bg-bg px-1">npm run garmin</code> on your computer to import HRV, sleep, resting HR, Body Battery and your Garmin lactate threshold (see README).
          </p>
        )}
      </div>

      <div className="card space-y-2">
        <div className="label">Running analysis</div>
        <p className="text-xs text-muted">Re-process all runs with the latest best-effort logic (GPS-spike filtering, treadmill runs excluded). Takes a few syncs because of Strava&apos;s rate limit.</p>
        <form action={reanalyseRuns}>
          <button className="btn-ghost w-full text-sm">Re-analyse runs</button>
        </form>
      </div>

      <form action={saveSettings} className="space-y-4">
        <div className="card space-y-3">
          <div className="label">Heart rate</div>
          <p className="text-xs text-muted">Threshold HR = roughly your average HR over the last 20 min of a hard 30-min solo effort. Garmin shows an estimate under Performance Stats → Lactate Threshold (imported automatically by the Garmin sync).</p>
          <div className="grid grid-cols-3 gap-3">
            <Num name="max_hr" label="Max HR" value={a.max_hr} />
            <Num name="resting_hr" label="Resting HR" value={a.resting_hr} />
            <Num name="threshold_hr" label="Threshold HR" value={a.threshold_hr} />
          </div>
          <label className="block">
            <span className="label">Sex (for TRIMP load formula)</span>
            <select name="sex" defaultValue={a.sex} className="input mt-1">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
        </div>

        <div className="card space-y-3">
          <div className="label">Running fitness</div>
          <p className="text-xs text-muted">Your 1 km HYROX run splits are predicted from this.</p>
          <Num name="threshold_pace_override" label="Threshold pace override (/km)" value={a.threshold_pace_override ? formatPace(a.threshold_pace_override) : null} hint="Leave blank to use Garmin's lactate threshold (if synced), otherwise an estimate from your runs. Format m:ss." />
          <div className="grid grid-cols-3 gap-3">
            <Num name="race_distance_m" label="Race (m)" value={a.race_distance_m} hint="e.g. 10000" />
            <Num name="race_time" label="Time" value={a.race_time_s ? formatDuration(a.race_time_s) : null} hint="h:mm:ss" />
            <label className="block">
              <span className="label">Date</span>
              <input className="input mt-1" type="date" name="race_date" defaultValue={a.race_date ?? ""} />
            </label>
          </div>
          <p className="text-xs text-muted">A running race (5K, 10K…) in the last 4 months is the most accurate source for paces and predictions.</p>
        </div>

        <div className="card space-y-3">
          <div className="label">HYROX</div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3">
            <input type="checkbox" name="show_predictions" defaultChecked={a.show_predictions} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
            <span>
              <span className="block font-semibold">Show HYROX predictions &amp; Progress</span>
              <span className="block text-xs text-muted">Adds the HYROX and Progress tabs, and makes the weekly advice include station, erg and sim work. Off = recovery and running focus.</span>
            </span>
          </label>
          <label className="block">
            <span className="label">Division</span>
            <select name="hyrox_division" defaultValue={a.hyrox_division} className="input mt-1">
              {Object.entries(SINGLES_DIVISIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <span className="mt-0.5 block text-xs text-muted">Your main singles division: sets race weights for scaling benchmarks. Doubles races you log get their own prediction on the HYROX page.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Num name="goal_name" label="Next race" value={a.goal_name} hint="e.g. HYROX London" />
            <label className="block">
              <span className="label">Race date</span>
              <input className="input mt-1" type="date" name="goal_date" defaultValue={a.goal_date ?? ""} />
            </label>
          </div>
          <p className="text-xs text-muted">The race date drives the taper advice and the countdown on Today.</p>
        </div>

        <button className="btn-primary w-full">Save settings</button>
      </form>

      <form action="/api/auth/logout" method="post">
        <button className="btn-ghost w-full">Sign out</button>
      </form>
    </div>
  );
}
