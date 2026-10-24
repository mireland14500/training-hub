import Link from "next/link";
import { deleteBodyScan } from "@/app/actions";
import BandSparkline from "@/components/BandSparkline";
import { formatPace } from "@/lib/analysis";
import { change, legImbalance, paceEffectOfFat, scanBefore, type Metric } from "@/lib/body";
import { db, getAthlete, type BodyScanRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtDate = (d: string, year = false) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

/** Coloured change: green when it moved the way you want. */
function Delta({ value, unit, good }: { value: number | null; unit: string; good: "up" | "down" | "none" }) {
  if (value === null) return <span className="text-muted">first scan</span>;
  if (value === 0) return <span className="text-muted">no change</span>;
  const better = good === "none" ? null : good === "up" ? value > 0 : value < 0;
  const color = better === null ? "var(--muted)" : better ? "var(--good)" : "var(--warn)";
  return (
    <span className="font-semibold" style={{ color }}>
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
      {unit}
    </span>
  );
}

const TILES: { key: Metric; label: string; unit: string; good: "up" | "down" | "none" }[] = [
  { key: "weight_kg", label: "Weight", unit: " kg", good: "none" },
  { key: "body_fat_pct", label: "Body fat", unit: "%", good: "down" },
  { key: "skeletal_muscle_kg", label: "Muscle", unit: " kg", good: "up" },
];

export default async function Body() {
  const [athlete, { data, error }] = await Promise.all([getAthlete(), db().from("body_scans").select("*").order("date", { ascending: true })]);
  if (error) {
    return (
      <div className="card mx-auto mt-6 max-w-xl text-sm">
        Body scans need a new database table. Run <code className="rounded bg-bg px-1">supabase/schema.sql</code> in the Supabase SQL Editor, then reload.
      </div>
    );
  }
  const scans = (data ?? []) as BodyScanRow[];
  const latest = scans[scans.length - 1];
  const previous = scans[scans.length - 2];
  const first = scans[0];

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold">Body</h1>
        <p className="text-sm text-muted">{latest ? `Latest InBody scan ${fmtDate(latest.date, true)}` : "InBody scans · weight, fat and muscle"}</p>
      </div>
      <Link href="/body/new" className="btn-primary text-sm">+ Add scan</Link>
    </div>
  );

  if (!latest) {
    return (
      <div className="mx-auto max-w-xl space-y-3.5">
        {header}
        <div className="card space-y-2 text-sm text-muted">
          <p>Take a photo of your InBody result sheet, or screenshot the InBody app, and the numbers are read for you.</p>
          <p>Every scan adds to your weight, body fat and muscle trends, and shows roughly how changes in fat mass affect your running pace.</p>
        </div>
      </div>
    );
  }

  // Running impact: fat-mass change over ~3 months (or since the first scan).
  const base = scanBefore(scans, 84) ?? (first !== latest ? first : undefined);
  const fatChange = change(latest, base, "body_fat_kg");
  const ltPace = athlete.garmin_lt_speed ? 1000 / athlete.garmin_lt_speed : null;
  const effect = fatChange !== null && latest.weight_kg && ltPace ? paceEffectOfFat(Number(latest.weight_kg), fatChange, ltPace) : null;
  const legs = legImbalance(latest.segmental_lean);
  const series = (k: Metric) => scans.slice(-12).map((s) => (s[k] == null ? null : Number(s[k])));

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      {header}

      <div className="grid grid-cols-3 gap-2.5">
        {TILES.map((t) => (
          <div key={t.key} className="card p-3">
            <div className="text-[11px] font-semibold uppercase text-muted">{t.label}</div>
            <div className="tabular mt-1 text-xl font-extrabold">
              {latest[t.key] != null ? Number(latest[t.key]) : "–"}
              <span className="text-sm font-semibold text-muted">{latest[t.key] != null ? t.unit : ""}</span>
            </div>
            <div className="text-xs">
              <Delta value={change(latest, previous, t.key)} unit={t.unit.trim() === "%" ? " pts" : t.unit} good={t.good} />
            </div>
          </div>
        ))}
      </div>
      {previous && <p className="-mt-1.5 text-xs text-muted">Changes vs your previous scan on {fmtDate(previous.date)}.</p>}

      {base && (
        <section className="card space-y-1.5">
          <div className="label">Running impact</div>
          <p className="text-[15px]">
            Fat mass <Delta value={fatChange} unit=" kg" good="down" /> since {fmtDate(base.date)}
            {effect !== null && effect !== 0 && (
              <>
                {" "}≈ <b className="tabular">{Math.abs(effect)} s/km {effect < 0 ? "faster" : "slower"}</b> at threshold ({formatPace(ltPace!)}/km)
              </>
            )}
            .
          </p>
          <p className="text-xs text-muted">Rough guide, assuming the same fitness: carrying less fat costs less energy per km. Muscle mass changes are left out.</p>
        </section>
      )}

      {scans.length >= 2 && (
        <section className="card space-y-3">
          <div className="label">Trends · last {Math.min(scans.length, 12)} scans</div>
          {(
            [
              ["weight_kg", "Weight", "var(--accent)", "kg"],
              ["body_fat_pct", "Body fat", "var(--warn)", "%"],
              ["skeletal_muscle_kg", "Skeletal muscle", "var(--good)", "kg"],
            ] as const
          ).map(([k, label, color, unit]) =>
            series(k).filter((x) => x !== null).length >= 2 ? (
              <div key={k}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{label}</span>
                  <span className="tabular text-muted">
                    {series(k).find((x) => x !== null)} → {latest[k] != null ? Number(latest[k]) : "–"} {unit}
                  </span>
                </div>
                <BandSparkline points={series(k)} band={null} color={color} height={56} margin={0.2} label={`${label} across your last scans`} />
              </div>
            ) : null,
          )}
        </section>
      )}

      {(legs || latest.visceral_fat_level != null || latest.bmr_kcal != null) && (
        <section className="card">
          <div className="label mb-1">Latest scan details</div>
          <ul className="tabular divide-y divide-border text-sm">
            {legs && (
              <li className="flex justify-between gap-3 py-2">
                <span>Leg lean balance</span>
                <span className="text-right font-bold" style={{ color: legs.pct > 3 ? "var(--warn)" : undefined }}>
                  {legs.stronger ? `${legs.stronger} ${legs.pct}% heavier` : "even"}
                </span>
              </li>
            )}
            {latest.visceral_fat_level != null && (
              <li className="flex justify-between py-2"><span>Visceral fat level</span><span className="font-bold">{Number(latest.visceral_fat_level)}</span></li>
            )}
            {latest.lean_mass_kg != null && (
              <li className="flex justify-between py-2"><span>Fat-free mass</span><span className="font-bold">{Number(latest.lean_mass_kg)} kg</span></li>
            )}
            {latest.bmr_kcal != null && (
              <li className="flex justify-between py-2"><span>BMR</span><span className="font-bold">{latest.bmr_kcal} kcal</span></li>
            )}
            {latest.inbody_score != null && (
              <li className="flex justify-between py-2"><span>InBody score</span><span className="font-bold">{latest.inbody_score}</span></li>
            )}
          </ul>
          {legs && legs.pct > 3 && <p className="mt-1 text-xs text-muted">Over ~3% difference between legs is worth some single-leg strength work (split squats, step-ups).</p>}
        </section>
      )}

      <section className="card">
        <div className="label mb-1">All scans</div>
        <ul className="divide-y divide-border">
          {[...scans].reverse().map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{fmtDate(s.date, true)}</span>
                <span className="tabular text-muted">
                  {" "}· {[s.weight_kg != null && `${Number(s.weight_kg)} kg`, s.body_fat_pct != null && `${Number(s.body_fat_pct)}% fat`, s.skeletal_muscle_kg != null && `${Number(s.skeletal_muscle_kg)} kg muscle`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {s.photo_path && <a href={`/api/photo/${s.photo_path}`} className="text-muted hover:text-accent" aria-label="View photo">📷</a>}
                <form action={deleteBodyScan}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-muted hover:text-bad" aria-label={`Delete scan from ${fmtDate(s.date, true)}`}>✕</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
