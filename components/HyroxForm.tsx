"use client";

import { useMemo, useState } from "react";
import { saveHyroxSession } from "@/app/actions";
import type { LinkCandidate } from "./ErgForm";
import { fmtTime, localInputValue, readPhoto } from "./photo";

const STATIONS = [
  { key: "ski", name: "SkiErg" },
  { key: "sled_push", name: "Sled Push" },
  { key: "sled_pull", name: "Sled Pull" },
  { key: "bbj", name: "Burpee Broad Jumps" },
  { key: "row", name: "Row" },
  { key: "farmers", name: "Farmers Carry" },
  { key: "lunges", name: "Sandbag Lunges" },
  { key: "wall_balls", name: "Wall Balls" },
] as const;

const KINDS = [
  { key: "full_sim", label: "Full sim" },
  { key: "half_sim", label: "Half sim" },
  { key: "race", label: "Race" },
  { key: "custom", label: "Other" },
];

interface Reading {
  total_time_s: number | null;
  runs: (number | null)[];
  stations: Record<string, number | null>;
  roxzone_s: number | null;
  notes: string;
}

function parse(v: string): number | null {
  if (!v.trim()) return null;
  const parts = v.split(":").map(Number);
  if (parts.some((p) => !isFinite(p))) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

export default function HyroxForm({ candidates }: { candidates: LinkCandidate[] }) {
  const [kind, setKind] = useState("full_sim");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [start, setStart] = useState(localInputValue(new Date()));
  const [rpe, setRpe] = useState<number | null>(null);
  const [photoPath, setPhotoPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals({ ...vals, [k]: e.target.value });
  const sum = useMemo(() => Object.entries(vals).filter(([k]) => k !== "total").reduce((a, [, v]) => a + (parse(v) ?? 0), 0), [vals]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const data = await readPhoto<Reading>(file, "hyrox");
      if (data.photoPath) setPhotoPath(data.photoPath);
      const r = data.reading;
      if (!r) throw new Error(data.error ?? "Could not read the photo");
      const next: Record<string, string> = {};
      r.runs.forEach((t, i) => t && (next[`run_${i + 1}`] = fmtTime(t)));
      for (const s of STATIONS) if (r.stations[s.key]) next[`st_${s.key}`] = fmtTime(r.stations[s.key]);
      if (r.roxzone_s) next.roxzone = fmtTime(r.roxzone_s);
      if (r.total_time_s) next.total = fmtTime(r.total_time_s);
      setVals(next);
      setMsg(r.notes ? `Check: ${r.notes}` : "Splits filled in — check them before saving.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const timeInput = (name: string, placeholder = "m:ss") => (
    <input className="input tabular py-2" name={name} value={vals[name] ?? ""} onChange={set(name)} placeholder={placeholder} inputMode="text" />
  );

  return (
    <form action={saveHyroxSession} className="space-y-4">
      <div className="card space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button type="button" key={k.key} onClick={() => setKind(k.key)} className={`rounded-xl border py-2 text-sm font-semibold ${kind === k.key ? "border-accent bg-accent text-white" : "border-border"}`}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="btn-ghost w-full cursor-pointer">
          📷 {busy ? "Reading splits…" : "Fill from a results screenshot or photo"}
          <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} disabled={busy} />
        </label>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>

      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="photo_path" value={photoPath} />
      <input type="hidden" name="start_iso" value={start ? new Date(start).toISOString() : ""} />
      <input type="hidden" name="rpe" value={rpe ?? ""} />

      <div className="card space-y-2">
        <p className="text-sm text-muted">Enter the splits you have — partial sims are fine. Times as m:ss.</p>
        <div className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2 text-xs text-muted">
          <span />
          <span>Run (1 km)</span>
          <span>Station</span>
        </div>
        {STATIONS.map((s, i) => (
          <div key={s.key} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
            <span className="tabular text-sm font-semibold text-muted">{i + 1}</span>
            {timeInput(`run_${i + 1}`)}
            <div>
              {timeInput(`st_${s.key}`, s.name)}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="block">
            <span className="label">Roxzone total</span>
            {timeInput("roxzone")}
          </label>
          <label className="block">
            <span className="label">Total time</span>
            {timeInput("total", sum ? fmtTime(sum) : "h:mm:ss")}
          </label>
        </div>
      </div>

      <div className="card space-y-3">
        <label className="block">
          <span className="label">When</span>
          <input className="input mt-1" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        {candidates.length > 0 && (
          <label className="block">
            <span className="label">Recorded on your Garmin too?</span>
            <select name="linked_activity_id" className="input mt-1" defaultValue="">
              <option value="">No — not recorded</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <span className="mt-0.5 block text-xs text-muted">Uses its heart rate and stops the session counting twice.</span>
          </label>
        )}
        <label className="block">
          <span className="label">Avg HR (optional)</span>
          <input className="input mt-1" name="avg_hr" inputMode="decimal" />
        </label>
        <fieldset>
          <legend className="label">Effort (RPE)</legend>
          <div className="mt-1 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} onClick={() => setRpe(n)} className={`rounded-lg border py-2 text-sm font-semibold ${rpe === n ? "border-accent bg-accent text-white" : "border-border"}`}>
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">Notes</span>
          <input className="input mt-1" name="notes" placeholder="Weights used, how it felt…" />
        </label>
        <button className="btn-primary w-full" disabled={busy || (!sum && !vals.total)}>Save session</button>
      </div>
    </form>
  );
}
