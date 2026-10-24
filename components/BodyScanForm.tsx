"use client";

import { useState } from "react";
import { saveBodyScan } from "@/app/actions";
import { readPhoto } from "./photo";

interface Reading {
  date: string | null;
  weight_kg: number | null;
  skeletal_muscle_kg: number | null;
  body_fat_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  total_body_water_l: number | null;
  visceral_fat_level: number | null;
  bmr_kcal: number | null;
  inbody_score: number | null;
  segmental_lean_kg: Record<"right_arm" | "left_arm" | "trunk" | "right_leg" | "left_leg", number | null>;
  notes: string;
}

const MAIN = [
  ["weight_kg", "Weight", "kg"],
  ["skeletal_muscle_kg", "Skeletal muscle", "kg"],
  ["body_fat_pct", "Body fat", "%"],
  ["body_fat_kg", "Body fat", "kg"],
] as const;
const MORE = [
  ["lean_mass_kg", "Fat-free mass", "kg"],
  ["total_body_water_l", "Body water", "L"],
  ["visceral_fat_level", "Visceral fat", "level"],
  ["bmr_kcal", "BMR", "kcal"],
  ["inbody_score", "InBody score", ""],
] as const;
const SEGMENTS = [
  ["left_arm", "Left arm"],
  ["right_arm", "Right arm"],
  ["trunk", "Trunk"],
  ["left_leg", "Left leg"],
  ["right_leg", "Right leg"],
] as const;

export default function BodyScanForm() {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState("");
  const [v, setV] = useState<Record<string, string>>({ date: new Date().toLocaleDateString("en-CA") });
  const field = (k: string) => ({ name: k, value: v[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const data = await readPhoto<Reading>(file, "inbody");
      if (data.photoPath) setPhotoPath(data.photoPath);
      if (data.error) setError(data.error);
      const r = data.reading;
      if (r) {
        const s = (x: number | null | undefined) => (x == null ? "" : String(x));
        const next: Record<string, string> = { ...v, notes: r.notes ?? "" };
        if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) next.date = r.date;
        for (const [k] of [...MAIN, ...MORE]) next[k] = s(r[k]);
        for (const [k] of SEGMENTS) next[`seg_${k}`] = s(r.segmental_lean_kg?.[k]);
        setV(next);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={saveBodyScan} className="space-y-4">
      <input type="hidden" name="photo_path" value={photoPath} />
      <div className="card space-y-3">
        <div className="label">Photo of your InBody result</div>
        <p className="text-xs text-muted">The printed sheet or a screenshot from the InBody app. The numbers are filled in for you; check them before saving.</p>
        <label className="btn-ghost w-full cursor-pointer">
          {busy ? "Reading…" : preview ? "Use a different photo" : "📷 Take or choose photo"}
          <input type="file" accept="image/*" onChange={onPhoto} className="hidden" disabled={busy} />
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your InBody result" className={`max-h-64 w-full rounded-xl object-contain ${busy ? "animate-pulse opacity-60" : ""}`} />
        )}
        {error && <p className="text-sm text-warn">{error}</p>}
      </div>

      <div className="card space-y-3">
        <label className="block">
          <span className="label">Scan date</span>
          <input type="date" required className="input mt-1" {...field("date")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {MAIN.map(([k, label, unit]) => (
            <Num key={k} label={label} unit={unit} {...field(k)} />
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-muted">More (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {MORE.map(([k, label, unit]) => (
              <Num key={k} label={label} unit={unit} {...field(k)} />
            ))}
          </div>
          <div className="label mt-4">Segmental lean (kg)</div>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {SEGMENTS.map(([k, label]) => (
              <Num key={k} label={label} unit="kg" {...field(`seg_${k}`)} />
            ))}
          </div>
        </details>
        <label className="block">
          <span className="label">Notes</span>
          <textarea rows={2} className="input mt-1" placeholder="e.g. morning, fasted" {...field("notes")} />
        </label>
      </div>
      <button className="btn-primary w-full" disabled={busy}>Save scan</button>
    </form>
  );
}

function Num({ label, unit, ...props }: { label: string; unit: string; name: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input type="number" step="any" inputMode="decimal" className="input mt-1" {...props} />
    </label>
  );
}
