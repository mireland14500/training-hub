import { saveCheckin } from "@/app/actions";
import { db, type CheckinRow } from "@/lib/db";
import { today } from "@/lib/data";

export const dynamic = "force-dynamic";

function Field({ name, label, hint, value, step }: { name: string; label: string; hint?: string; value?: number | null; step?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-1" name={name} type="number" inputMode="decimal" step={step ?? "1"} defaultValue={value ?? ""} />
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Scale({ name, label, low, high, value }: { name: string; label: string; low: string; high: string; value?: number | null }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="mt-1 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name={name} value={n} defaultChecked={value === n} className="peer sr-only" />
            <span className="block rounded-xl border border-border py-2.5 text-center font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white">{n}</span>
          </label>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-xs text-muted"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

export default async function Checkin() {
  const date = today();
  const { data } = await db().from("checkins").select("*").eq("date", date).maybeSingle();
  const c = data as CheckinRow | null;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Morning check-in</h1>
        <p className="text-sm text-muted">If you run the Garmin sync (<code>npm run garmin</code>), the Garmin numbers fill in automatically — just add soreness and energy. Otherwise copy them from Garmin Connect (My Day).</p>
      </div>
      <form action={saveCheckin} className="card space-y-4">
        <input type="hidden" name="date" value={date} />
        <div className="grid grid-cols-2 gap-3">
          <Field name="hrv_ms" label="HRV (ms)" hint="Overnight average" value={c?.hrv_ms} />
          <Field name="resting_hr" label="Resting HR" hint="bpm" value={c?.resting_hr} />
          <Field name="sleep_score" label="Sleep score" hint="0–100" value={c?.sleep_score} />
          <Field name="sleep_hours" label="Sleep (h)" step="0.1" value={c?.sleep_hours} />
          <Field name="body_battery" label="Body Battery" hint="On waking" value={c?.body_battery} />
          <Field name="training_readiness" label="Garmin readiness" hint="Optional, for comparison" value={c?.training_readiness} />
        </div>
        <Scale name="soreness" label="Muscle soreness" low="None" high="Very sore" value={c?.soreness} />
        <Scale name="energy" label="Energy / mood" low="Drained" high="Great" value={c?.energy} />
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input mt-1" name="notes" rows={2} defaultValue={c?.notes ?? ""} placeholder="Illness, travel, stress…" />
        </label>
        <button className="btn-primary w-full">Save check-in</button>
      </form>
    </div>
  );
}
