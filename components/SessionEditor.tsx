"use client";

import { useState } from "react";
import { saveSession } from "@/app/actions";
import { EXERCISES, EXERCISE_BY_KEY, FOCUS, entryPace, setDistance, type Entry, type ExerciseKey } from "@/lib/workout";
import { fmtTime, localInputValue, readPhoto } from "./photo";

interface Props {
  session: {
    id: string;
    name: string | null;
    focus: string | null;
    rpe: number | null;
    notes: string | null;
    entries: Entry[] | null;
    photoPath: string | null;
  } | null;
  /** For a new session: the day it was clicked on (YYYY-MM-DD). */
  defaultDate?: string;
}

interface Reading {
  title: string;
  focus: string;
  duration_s: number | null;
  entries: Entry[];
  notes: string;
}

/** Editable row: numbers as strings so half-typed values (e.g. "1:") survive re-renders. */
type Row = { key: number; exercise: ExerciseKey; values: Record<string, string> };

const NUM_FIELDS = ["sets", "distance_m", "reps", "speed_kmh", "incline_pct", "weight_kg"] as const;
let nextKey = 1;

function toRow(e: Entry): Row {
  const values: Record<string, string> = { name: e.name ?? "", notes: e.notes ?? "", time_s: e.time_s ? fmtTime(e.time_s) : "" };
  for (const f of NUM_FIELDS) values[f] = e[f] != null ? String(e[f]) : "";
  return { key: nextKey++, exercise: e.exercise in EXERCISE_BY_KEY ? e.exercise : "other", values };
}

function parseTime(v: string): number | null {
  if (!v.trim()) return null;
  const parts = v.split(":").map(Number);
  if (parts.some((p) => !isFinite(p))) return null;
  return parts.reduce((a, p) => a * 60 + p, 0) || null;
}

function toEntry(r: Row): Entry {
  const n = (k: string) => (r.values[k]?.trim() ? Number(r.values[k]) : null);
  return {
    exercise: r.exercise,
    name: r.values.name?.trim() || null,
    sets: n("sets"),
    distance_m: n("distance_m"),
    reps: n("reps"),
    time_s: parseTime(r.values.time_s ?? ""),
    speed_kmh: n("speed_kmh"),
    incline_pct: n("incline_pct"),
    weight_kg: n("weight_kg"),
    notes: r.values.notes?.trim() || null,
  };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${active ? "border-accent bg-accent text-white" : "border-border"}`}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, mode = "decimal", wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mode?: "decimal" | "text"; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <input className="input tabular mt-0.5 py-2" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={mode} />
    </label>
  );
}

function EntryCard({ row, onChange, onRemove, index }: { row: Row; onChange: (r: Row) => void; onRemove: () => void; index: number }) {
  const ex = EXERCISE_BY_KEY[row.exercise];
  const set = (k: string) => (v: string) => onChange({ ...row, values: { ...row.values, [k]: v } });
  const entry = toEntry(row);
  const pace = entryPace(entry);
  const dist = setDistance(entry);
  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <div className="flex items-center gap-2">
        <span className="tabular w-5 text-sm font-semibold text-muted">{index + 1}</span>
        <select className="input flex-1 py-2" value={row.exercise} onChange={(e) => onChange({ ...row, exercise: e.target.value as ExerciseKey })}>
          {EXERCISES.map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        <button type="button" onClick={onRemove} className="px-2 text-lg text-muted hover:text-bad" aria-label="Remove exercise">✕</button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {ex.kind === "other" && <Field label="Exercise" value={row.values.name} onChange={set("name")} placeholder="e.g. KB swings" mode="text" wide />}
        <Field label="Sets" value={row.values.sets} onChange={set("sets")} placeholder="1" />
        {ex.kind === "cardio" && <Field label="Metres / set" value={row.values.distance_m} onChange={set("distance_m")} placeholder={ex.key === "treadmill" || ex.key === "run" ? "1000" : "500"} />}
        {ex.kind === "station" && ex.amountUnit === "m" && <Field label="Metres / set" value={row.values.distance_m} onChange={set("distance_m")} placeholder="25" />}
        {(ex.kind === "other" || ex.amountUnit === "reps") && <Field label="Reps / set" value={row.values.reps} onChange={set("reps")} placeholder="20" />}
        <Field label="Time / set" value={row.values.time_s} onChange={set("time_s")} placeholder="m:ss" mode="text" />
        {ex.key === "treadmill" && (
          <>
            <Field label="Speed km/h" value={row.values.speed_kmh} onChange={set("speed_kmh")} placeholder="15" />
            <Field label="Incline %" value={row.values.incline_pct} onChange={set("incline_pct")} placeholder="1" />
          </>
        )}
        {(ex.kind === "station" || ex.kind === "other") && <Field label={ex.key === "farmers" ? "Kg / hand" : "Weight kg"} value={row.values.weight_kg} onChange={set("weight_kg")} placeholder={ex.key === "sled_push" ? "152" : ""} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <input className="input flex-1 py-1.5 text-sm" value={row.values.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Notes (rest, effort…)" />
        {pace && (
          <span className="tabular text-sm font-semibold text-accent">
            {fmtTime(pace).replace(/\.\d$/, "")}/{ex.paceUnit}
            {ex.key === "treadmill" && dist && !entry.distance_m ? ` · ${Math.round(dist)} m` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SessionEditor({ session, defaultDate }: Props) {
  const [name, setName] = useState(session?.name ?? "");
  const [focus, setFocus] = useState<string | null>(session?.focus ?? null);
  const [rpe, setRpe] = useState<number | null>(session?.rpe ?? null);
  const [rows, setRows] = useState<Row[]>(() => (session?.entries ?? []).map(toRow));
  const [photoPath, setPhotoPath] = useState("");
  const [preview, setPreview] = useState<string | null>(session?.photoPath ? `/api/photo/${session.photoPath}` : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [start, setStart] = useState(() => localInputValue(defaultDate ? new Date(`${defaultDate}T18:00:00`) : new Date()));
  const [minutes, setMinutes] = useState("");

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setPreview(URL.createObjectURL(file));
    try {
      const data = await readPhoto<Reading>(file, "workout");
      if (data.photoPath) setPhotoPath(data.photoPath);
      const r = data.reading;
      if (!r) throw new Error(data.error ?? "Could not read the photo — add the exercises below.");
      setRows((prev) => [...prev, ...r.entries.map(toRow)]);
      if (r.focus !== "unknown" && !focus) setFocus(r.focus);
      if (!name && r.title) setName(r.title);
      if (!session && r.duration_s && !minutes) setMinutes(String(Math.round(r.duration_s / 60)));
      setMsg(r.notes ? `Read ${r.entries.length} block(s). Check: ${r.notes}` : `Read ${r.entries.length} block(s) — check them and fill in your actual paces/weights.`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number) => (r: Row) => setRows(rows.map((x, j) => (j === i ? r : x)));
  const remove = (i: number) => () => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { key: nextKey++, exercise: "ski", values: { sets: "", distance_m: "", reps: "", time_s: "", speed_kmh: "", incline_pct: "", weight_kg: "", name: "", notes: "" } }]);

  return (
    <form action={saveSession} className="space-y-4">
      <input type="hidden" name="id" value={session?.id ?? ""} />
      <input type="hidden" name="focus" value={focus ?? ""} />
      <input type="hidden" name="rpe" value={rpe ?? ""} />
      <input type="hidden" name="photo_path" value={photoPath} />
      <input type="hidden" name="entries" value={JSON.stringify(rows.map(toEntry))} />

      {!session && (
        <div className="card grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="label">When</span>
            <input className="input mt-1" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="hidden" name="start_iso" value={start ? new Date(start).toISOString() : ""} />
          </label>
          <label className="block">
            <span className="label">Duration (min) *</span>
            <input className="input tabular mt-1" value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="45" required />
            <input type="hidden" name="duration" value={minutes ? String(Number(minutes) * 60) : ""} />
          </label>
          <label className="block">
            <span className="label">Avg HR</span>
            <input className="input tabular mt-1" name="avg_hr" inputMode="numeric" placeholder="optional" />
          </label>
        </div>
      )}

      <div className="card space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input className="input mt-1" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thursday threshold class" />
        </label>
        <div>
          <div className="label mb-1">What was it?</div>
          <div className="flex flex-wrap gap-2">
            {FOCUS.map((f) => (
              <Chip key={f.key} active={focus === f.key} onClick={() => setFocus(focus === f.key ? null : f.key)}>{f.label}</Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Overrides what Strava called it (e.g. &quot;HIIT&quot;) in your weekly analysis.</p>
        </div>
        <fieldset>
          <legend className="label">Effort (RPE)</legend>
          <div className="mt-1 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} onClick={() => setRpe(rpe === n ? null : n)} className={`rounded-lg border py-2 text-sm font-semibold ${rpe === n ? "border-accent bg-accent text-white" : "border-border"}`}>
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Used for training load when the session has no heart rate.</p>
        </fieldset>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="label">What you did</div>
          <label className="btn-ghost cursor-pointer px-3 py-1.5 text-sm">
            📷 {busy ? "Reading…" : "From photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} disabled={busy} />
          </label>
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Workout photo" className="max-h-56 w-full rounded-xl object-contain" />
        )}
        {msg && <p className="text-sm text-muted">{msg}</p>}
        {rows.length === 0 && <p className="text-sm text-muted">Snap the whiteboard or screen, or add exercises by hand — e.g. 4 × 500 m SkiErg in 1:50, 4 × 1 km treadmill at 15 km/h.</p>}
        {rows.map((r, i) => (
          <EntryCard key={r.key} row={r} index={i} onChange={update(i)} onRemove={remove(i)} />
        ))}
        <button type="button" onClick={add} className="btn-ghost w-full text-sm">+ Add exercise</button>
      </div>

      <div className="card space-y-3">
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input mt-1" name="notes" rows={2} defaultValue={session?.notes ?? ""} placeholder="How it felt, coach cues…" />
        </label>
        <button className="btn-primary w-full" disabled={busy}>Save session</button>
      </div>
    </form>
  );
}
