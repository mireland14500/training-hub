"use client";

import { useMemo, useState } from "react";
import { saveSkiSession } from "@/app/actions";

interface Split {
  time_s: number | null;
  distance_m: number | null;
  pace_500m_s: number | null;
  watts: number | null;
  calories: number | null;
  stroke_rate: number | null;
  heart_rate: number | null;
}
interface Reading {
  workout_description: string;
  total_time_s: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_pace_500m_s: number | null;
  avg_watts: number | null;
  avg_stroke_rate: number | null;
  avg_heart_rate: number | null;
  splits: Split[];
  notes: string;
}
export interface LinkCandidate {
  id: string;
  label: string;
}

function fmt(s: number | null | undefined): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).replace(/\.0$/, "");
  const ss = sec.padStart(sec.includes(".") ? 4 : 2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Shrinks the photo so uploads are fast on mobile data and under server limits. */
async function resize(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process photo"))), "image/jpeg", 0.85));
}

function localInputValue(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default function SkiForm({ candidates }: { candidates: LinkCandidate[] }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState("");
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<Split[]>([]);
  const [rpe, setRpe] = useState<number | null>(null);
  const [start, setStart] = useState(localInputValue(new Date()));
  const [f, setF] = useState({ workout: "", time: "", distance_m: "", calories: "", pace_500: "", avg_watts: "", stroke_rate: "", avg_hr: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const startIso = useMemo(() => (start ? new Date(start).toISOString() : ""), [start]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const body = new FormData();
      body.append("photo", new File([await resize(file)], "monitor.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/ski/read", { method: "POST", body });
      const data = await res.json();
      if (data.photoPath) setPhotoPath(data.photoPath);
      if (data.error) setError(data.error);
      const r: Reading | null = data.reading;
      if (r) {
        setF({
          workout: r.workout_description ?? "",
          time: fmt(r.total_time_s),
          distance_m: r.distance_m?.toString() ?? "",
          calories: r.calories?.toString() ?? "",
          pace_500: fmt(r.avg_pace_500m_s),
          avg_watts: r.avg_watts?.toString() ?? "",
          stroke_rate: r.avg_stroke_rate?.toString() ?? "",
          avg_hr: r.avg_heart_rate?.toString() ?? "",
        });
        setSplits(r.splits ?? []);
        setNotes(r.notes ?? "");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof typeof f, label: string, placeholder: string, mode: "decimal" | "text" = "decimal") => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input tabular mt-1" name={k} value={f[k]} onChange={set(k)} placeholder={placeholder} inputMode={mode} />
    </label>
  );

  return (
    <form action={saveSkiSession} className="space-y-4">
      <div className="card">
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-6 text-center">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Monitor photo" className="max-h-64 rounded-lg object-contain" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="font-semibold">Take or upload a photo of the monitor</span>
              <span className="text-xs text-muted">Straight-on, screen filling the frame, after the workout summary shows</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} />
        </label>
        {busy && <p className="mt-3 text-center text-sm text-muted">Reading the monitor…</p>}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {notes && <p className="mt-3 text-sm text-warn">Check: {notes}</p>}
      </div>

      <div className="card space-y-3">
        <p className="text-sm text-muted">Check the numbers (or type them in without a photo).</p>
        <input type="hidden" name="photo_path" value={photoPath} />
        <input type="hidden" name="splits" value={JSON.stringify(splits)} />
        <input type="hidden" name="start_iso" value={startIso} />
        <div className="grid grid-cols-2 gap-3">
          {input("workout", "Workout", "e.g. 2000m or 8x500m", "text")}
          <label className="block">
            <span className="label">Start</span>
            <input className="input mt-1" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          {input("time", "Time *", "7:42.3", "text")}
          {input("distance_m", "Metres", "2000")}
          {input("calories", "Calories", "120")}
          {input("pace_500", "Avg /500m", "1:55.6", "text")}
          {input("avg_watts", "Avg watts", "230")}
          {input("stroke_rate", "Stroke rate", "38")}
          {input("avg_hr", "Avg HR", "From Garmin")}
        </div>

        {candidates.length > 0 && (
          <label className="block">
            <span className="label">Recorded on your Garmin too?</span>
            <select name="linked_activity_id" className="input mt-1" defaultValue="">
              <option value="">No — not recorded</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <span className="mt-0.5 block text-xs text-muted">Links the heart-rate data and stops the session counting twice.</span>
          </label>
        )}

        <fieldset>
          <legend className="label">Effort (RPE)</legend>
          <input type="hidden" name="rpe" value={rpe ?? ""} />
          <div className="mt-1 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} onClick={() => setRpe(n)} className={`rounded-lg border py-2 text-sm font-semibold ${rpe === n ? "border-accent bg-accent text-white" : "border-border"}`}>
                {n}
              </button>
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-muted"><span>Very easy</span><span>Max</span></div>
        </fieldset>

        {splits.length > 0 && (
          <div className="overflow-x-auto">
            <div className="label mb-1">Splits read from photo</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="text-left font-normal">#</th><th className="text-right font-normal">Time</th><th className="text-right font-normal">m</th><th className="text-right font-normal">/500m</th><th className="text-right font-normal">W</th><th className="text-right font-normal">s/m</th></tr>
              </thead>
              <tbody className="tabular divide-y divide-border">
                {splits.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1 text-right">{fmt(s.time_s)}</td>
                    <td className="py-1 text-right">{s.distance_m ?? ""}</td>
                    <td className="py-1 text-right">{fmt(s.pace_500m_s)}</td>
                    <td className="py-1 text-right">{s.watts ?? ""}</td>
                    <td className="py-1 text-right">{s.stroke_rate ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="block">
          <span className="label">Notes</span>
          <input className="input mt-1" name="notes" placeholder="How it felt, damper setting…" />
        </label>

        <button className="btn-primary w-full" disabled={busy || !f.time}>Save session</button>
      </div>
    </form>
  );
}
