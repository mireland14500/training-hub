"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pace500FromWatts, sessionLoad } from "@/lib/analysis";
import { db, getAthlete } from "@/lib/db";
import { currentHyroxPredictions, localDate } from "@/lib/data";
import { DIVISIONS } from "@/lib/hyrox";
import { sanitizeEntries } from "@/lib/workout";
import { recomputeLoads, resetRunAnalysis } from "@/lib/sync";

function num(form: FormData, key: string): number | null {
  const v = String(form.get(key) ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function str(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? "").trim();
  return v || null;
}
/** Parses "1:23:45", "7:42.3" or plain seconds into seconds. */
function duration(form: FormData, key: string): number | null {
  const v = String(form.get(key) ?? "").trim();
  if (!v) return null;
  const parts = v.split(":").map(Number);
  if (parts.some((p) => !isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export async function saveCheckin(form: FormData) {
  const row = {
    date: str(form, "date"),
    sleep_score: num(form, "sleep_score"),
    sleep_hours: num(form, "sleep_hours"),
    hrv_ms: num(form, "hrv_ms"),
    resting_hr: num(form, "resting_hr"),
    body_battery: num(form, "body_battery"),
    training_readiness: num(form, "training_readiness"),
    soreness: num(form, "soreness"),
    energy: num(form, "energy"),
    notes: str(form, "notes"),
  };
  if (!row.date) throw new Error("Date is required");
  const { error } = await db().from("checkins").upsert(row);
  if (error) throw error;
  revalidatePath("/");
  redirect("/");
}

export async function saveSettings(form: FormData) {
  const before = await getAthlete();
  const racePace = duration(form, "race_time");
  const thresholdPace = duration(form, "threshold_pace_override");
  const row = {
    id: 1,
    sex: form.get("sex") === "female" ? "female" : "male",
    max_hr: num(form, "max_hr") ?? before.max_hr,
    resting_hr: num(form, "resting_hr") ?? before.resting_hr,
    threshold_hr: num(form, "threshold_hr") ?? before.threshold_hr,
    threshold_pace_override: thresholdPace,
    race_distance_m: num(form, "race_distance_m"),
    race_time_s: racePace,
    race_date: str(form, "race_date"),
    goal_name: str(form, "goal_name"),
    goal_date: str(form, "goal_date"),
    hyrox_division: ["open_men", "open_women", "pro_men", "pro_women"].includes(String(form.get("hyrox_division")))
      ? String(form.get("hyrox_division"))
      : before.hyrox_division,
    show_predictions: form.get("show_predictions") === "on",
  };
  const { error } = await db().from("athlete").upsert(row);
  if (error) throw error;
  if (row.max_hr !== before.max_hr || row.resting_hr !== before.resting_hr || row.threshold_hr !== before.threshold_hr || row.sex !== before.sex) {
    await recomputeLoads();
  }
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/** HR data from the Garmin/Strava recording of the same session, if the user linked one. */
async function linkedHr(linkedId: string | null) {
  if (!linkedId) return { avg_hr: null, max_hr: null, zone_seconds: null };
  const { data } = await db().from("activities").select("avg_hr, max_hr, zone_seconds").eq("id", linkedId).single();
  return { avg_hr: data?.avg_hr ?? null, max_hr: data?.max_hr ?? null, zone_seconds: data?.zone_seconds ?? null };
}

/** Saves a logged session; a linked Garmin recording of it stops counting separately. */
async function insertLogged(row: Record<string, unknown>, linkedId: string | null) {
  const { error } = await db().from("activities").insert({ ...row, linked_activity_id: linkedId, streams_fetched: true });
  if (error) throw error;
  if (linkedId) await db().from("activities").update({ excluded: true }).eq("id", linkedId);
  revalidatePath("/", "layout");
}

const MACHINES = ["SkiErg", "RowErg", "BikeErg"];

export async function saveErgSession(form: FormData) {
  const athlete = await getAthlete();
  const durationS = duration(form, "time");
  if (!durationS) throw new Error("Time is required");
  const machine = MACHINES.includes(String(form.get("machine"))) ? String(form.get("machine")) : "SkiErg";
  const distance = num(form, "distance_m");
  const watts = num(form, "avg_watts");
  const pace500 = duration(form, "pace_500") ?? (distance ? (durationS / distance) * 500 : watts ? pace500FromWatts(watts) : null);
  const rpe = num(form, "rpe");
  const linkedId = str(form, "linked_activity_id");
  const hr = await linkedHr(linkedId);
  const avgHr = num(form, "avg_hr") ?? hr.avg_hr;
  const { load, method } = sessionLoad({ duration_s: durationS, avg_hr: avgHr, rpe }, athlete);

  let splits: unknown = [];
  try {
    splits = JSON.parse(String(form.get("splits") ?? "[]"));
  } catch {}

  await insertLogged(
    {
      source: str(form, "photo_path") ? "ski_photo" : "manual",
      sport: machine,
      name: `${machine} ${str(form, "workout") ?? ""}`.trim(),
      // Browser-computed ISO time, so the session lands on the right local day.
      start_time: str(form, "start_iso") ?? new Date().toISOString(),
      duration_s: Math.round(durationS),
      moving_s: Math.round(durationS),
      distance_m: distance,
      avg_hr: avgHr,
      max_hr: hr.max_hr,
      avg_speed: distance ? distance / durationS : null,
      avg_watts: watts,
      calories: num(form, "calories"),
      rpe,
      load,
      load_method: method,
      zone_seconds: hr.zone_seconds,
      details: { workout: str(form, "workout"), pace_500m_s: pace500, stroke_rate: num(form, "stroke_rate"), splits },
      photo_path: str(form, "photo_path"),
      notes: str(form, "notes"),
    },
    linkedId,
  );
  redirect("/ergs");
}

const STATION_KEYS = ["ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls"];
const HYROX_KINDS = ["race", "full_sim", "half_sim", "custom"];
const HYROX_DIVISIONS = ["open_men", "open_women", "pro_men", "pro_women", "doubles_men", "doubles_women", "doubles_mixed", "pro_doubles_men", "pro_doubles_women"];

export async function saveHyroxSession(form: FormData) {
  const athlete = await getAthlete();
  const kind = HYROX_KINDS.includes(String(form.get("kind"))) ? String(form.get("kind")) : "full_sim";
  const runs = Array.from({ length: 8 }, (_, i) => duration(form, `run_${i + 1}`));
  const stations = Object.fromEntries(STATION_KEYS.map((k) => [k, duration(form, `st_${k}`)]));
  const roxzone = duration(form, "roxzone");
  const parts = [...runs, ...Object.values(stations), roxzone].filter((x): x is number => x !== null);
  const total = duration(form, "total") ?? (parts.length ? parts.reduce((a, b) => a + b, 0) : null);
  if (!total) throw new Error("Enter the total time or at least one split");

  const rpe = num(form, "rpe");
  const linkedId = str(form, "linked_activity_id");
  const hr = await linkedHr(linkedId);
  const avgHr = num(form, "avg_hr") ?? hr.avg_hr;
  const { load, method } = sessionLoad({ duration_s: total, avg_hr: avgHr, rpe }, athlete);
  const label = { race: "HYROX race", full_sim: "HYROX full sim", half_sim: "HYROX half sim", custom: "HYROX workout" }[kind];

  await insertLogged(
    {
      source: str(form, "photo_path") ? "ski_photo" : "manual",
      sport: "HYROX",
      name: str(form, "name") ?? label,
      start_time: str(form, "start_iso") ?? new Date().toISOString(),
      duration_s: Math.round(total),
      moving_s: Math.round(total),
      avg_hr: avgHr,
      max_hr: hr.max_hr,
      rpe,
      load,
      load_method: method,
      zone_seconds: hr.zone_seconds,
      details: { kind, runs, stations, roxzone_s: roxzone, division: HYROX_DIVISIONS.includes(String(form.get("division"))) ? String(form.get("division")) : athlete.hyrox_division },
      photo_path: str(form, "photo_path"),
      notes: str(form, "notes"),
    },
    linkedId,
  );
  redirect("/hyrox");
}

export async function saveBenchmark(form: FormData) {
  const station = String(form.get("station"));
  const time = duration(form, "time");
  if (!STATION_KEYS.includes(station) || !time) throw new Error("Pick a station and enter a time");
  const { error } = await db().from("benchmarks").insert({
    date: str(form, "date") ?? new Date().toISOString().slice(0, 10),
    station,
    time_s: time,
    amount: num(form, "amount"),
    load_kg: num(form, "load_kg"),
    fresh: form.get("fresh") !== "no",
    notes: str(form, "notes"),
  });
  if (error) throw error;
  revalidatePath("/", "layout");
  redirect(form.get("again") ? "/log/station?saved=1" : "/hyrox");
}

export async function deleteBenchmark(id: string) {
  await db().from("benchmarks").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function setRpe(id: string, rpe: number) {
  const athlete = await getAthlete();
  const { data } = await db().from("activities").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const { load, method } = sessionLoad(
    { duration_s: data.moving_s || data.duration_s, avg_hr: data.avg_hr, rpe, suffer_score: data.suffer_score, garmin_load: data.garmin_load, garmin_scale: athlete.garmin_load_scale },
    athlete,
  );
  await db().from("activities").update({ rpe, load, load_method: method }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function deleteActivity(id: string) {
  const { data } = await db().from("activities").select("linked_activity_id, photo_path, source").eq("id", id).single();
  if (!data || data.source === "strava") return; // Strava activities are managed by Strava
  if (data.linked_activity_id) await db().from("activities").update({ excluded: false }).eq("id", data.linked_activity_id);
  if (data.photo_path) await db().storage.from("ski-photos").remove([data.photo_path]);
  await db().from("activities").delete().eq("id", id);
  revalidatePath("/", "layout");
}

/** Copies Garmin's lactate threshold HR into your HR settings and re-scores training load. */
export async function applyGarminThresholdHr() {
  const athlete = await getAthlete();
  if (!athlete.garmin_lt_hr) return;
  await db().from("athlete").update({ threshold_hr: athlete.garmin_lt_hr }).eq("id", 1);
  await recomputeLoads();
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/** Queues every run for re-analysis on the next syncs (after best-effort logic changes). */
export async function reanalyseRuns() {
  await resetRunAnalysis();
  revalidatePath("/", "layout");
  redirect("/settings?reanalyse=1");
}

const FOCUS_KEYS = ["easy", "long", "threshold", "intervals", "hyrox", "strength", "recovery", "race"];

/**
 * Saves a session from the calendar editor: what it actually was (focus), RPE, photo and
 * the exercises done. Creates a manual session when there's no id (e.g. a class not recorded).
 */
export async function saveSession(form: FormData) {
  const athlete = await getAthlete();
  const id = str(form, "id");
  let entries: unknown = [];
  try {
    entries = JSON.parse(String(form.get("entries") ?? "[]"));
  } catch {}
  const focusRaw = str(form, "focus");
  const fields: Record<string, unknown> = {
    name: str(form, "name"),
    focus: focusRaw && FOCUS_KEYS.includes(focusRaw) ? focusRaw : null,
    rpe: num(form, "rpe"),
    notes: str(form, "notes"),
    entries: sanitizeEntries(entries),
  };
  const photo = str(form, "photo_path");
  if (photo) fields.photo_path = photo;

  let startTime: string;
  if (id) {
    // select("*") so a column missing from an older database doesn't make the whole read fail.
    const { data: a, error: readErr } = await db().from("activities").select("*").eq("id", id).maybeSingle();
    if (readErr) throw new Error(`Couldn't read the session: ${readErr.message}`);
    if (!a) throw new Error("Session not found — it may have been deleted");
    fields.name ??= a.name;
    const { load, method } = sessionLoad(
      {
        duration_s: a.moving_s || a.duration_s,
        avg_hr: a.avg_hr,
        rpe: fields.rpe as number | null,
        suffer_score: a.suffer_score,
        garmin_load: a.garmin_load,
        garmin_scale: athlete.garmin_load_scale,
      },
      athlete,
    );
    const { error } = await db().from("activities").update({ ...fields, load, load_method: method }).eq("id", id);
    if (error) throw new Error(`Couldn't save the session: ${error.message}. If it mentions a missing column, run supabase/schema.sql again in the Supabase SQL Editor.`);
    startTime = a.start_time;
  } else {
    const durationS = duration(form, "duration");
    if (!durationS) throw new Error("Enter how long the session took");
    startTime = str(form, "start_iso") ?? new Date().toISOString();
    const avgHr = num(form, "avg_hr");
    const { load, method } = sessionLoad({ duration_s: durationS, avg_hr: avgHr, rpe: fields.rpe as number | null }, athlete);
    const { error } = await db().from("activities").insert({
      ...fields,
      name: fields.name ?? "Workout",
      source: photo ? "ski_photo" : "manual",
      sport: "Workout",
      start_time: startTime,
      duration_s: Math.round(durationS),
      moving_s: Math.round(durationS),
      avg_hr: avgHr,
      load,
      load_method: method,
      streams_fetched: true,
    });
    if (error) throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/calendar?week=${localDate(startTime)}`);
}

/** Deletes a session you logged yourself (Strava sessions are managed in Strava). */
export async function deleteSession(form: FormData) {
  const id = str(form, "id");
  if (!id) return;
  const { data } = await db().from("activities").select("start_time").eq("id", id).single();
  await deleteActivity(id);
  redirect(`/calendar${data ? `?week=${localDate(data.start_time)}` : ""}`);
}

/** "Same as last week": copies what was done (and the session type) from an earlier session. */
export async function copySessionDetails(form: FormData) {
  const targetId = str(form, "target");
  const sourceId = str(form, "source");
  if (!targetId || !sourceId) return;
  const [{ data: target }, { data: source }] = await Promise.all([
    db().from("activities").select("start_time, focus").eq("id", targetId).single(),
    db().from("activities").select("entries, focus").eq("id", sourceId).single(),
  ]);
  if (!target || !source?.entries) return;
  const { error } = await db()
    .from("activities")
    .update({ entries: source.entries, focus: target.focus ?? source.focus })
    .eq("id", targetId);
  if (error) throw error;
  revalidatePath("/", "layout");
  redirect(`/calendar?week=${localDate(target.start_time)}`);
}

const OFF_REASONS = ["ill", "injury", "holiday", "other"];

/** Marks days off training (ill, injured, holiday) so the analysis doesn't read them as lost fitness. */
export async function saveTimeOff(form: FormData) {
  const start = str(form, "start");
  const end = str(form, "end") ?? start;
  if (!start || !end) throw new Error("Pick the dates");
  const reason = OFF_REASONS.includes(String(form.get("reason"))) ? String(form.get("reason")) : "ill";
  const [from, to] = start <= end ? [start, end] : [end, start];
  const { error } = await db().from("time_off").insert({ start_date: from, end_date: to, reason, notes: str(form, "notes") });
  if (error) throw error;
  revalidatePath("/", "layout");
  redirect(`/calendar?week=${from}`);
}

export async function deleteTimeOff(form: FormData) {
  const id = str(form, "id");
  if (id) await db().from("time_off").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/calendar${str(form, "week") ? `?week=${str(form, "week")}` : ""}`);
}

/** Answers "is this Strava activity a HYROX race?" from the HYROX page. */
export async function confirmRace(form: FormData) {
  const id = str(form, "id");
  if (!id) return;
  const isRace = form.get("answer") === "race";
  await db().from("activities").update({ focus: isRace ? "race" : "hyrox" }).eq("id", id);
  revalidatePath("/", "layout");
  redirect("/hyrox");
}

const SEGMENTS = ["right_arm", "left_arm", "trunk", "right_leg", "left_leg"] as const;

export async function saveBodyScan(form: FormData) {
  const date = str(form, "date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date is required");
  const weight = num(form, "weight_kg");
  const fatKg = num(form, "body_fat_kg");
  // Fill in % from kg (or the other way round) when only one was on the sheet.
  const fatPct = num(form, "body_fat_pct") ?? (weight && fatKg ? Math.round((fatKg / weight) * 1000) / 10 : null);
  const segments = Object.fromEntries(SEGMENTS.map((k) => [k, num(form, `seg_${k}`)]));
  const row = {
    date,
    weight_kg: weight,
    skeletal_muscle_kg: num(form, "skeletal_muscle_kg"),
    body_fat_kg: fatKg ?? (weight && fatPct ? Math.round(weight * fatPct) / 100 : null),
    body_fat_pct: fatPct,
    lean_mass_kg: num(form, "lean_mass_kg"),
    total_body_water_l: num(form, "total_body_water_l"),
    visceral_fat_level: num(form, "visceral_fat_level"),
    bmr_kcal: num(form, "bmr_kcal"),
    inbody_score: num(form, "inbody_score"),
    segmental_lean: Object.values(segments).some((v) => v !== null) ? segments : null,
    photo_path: str(form, "photo_path"),
    notes: str(form, "notes"),
  };
  if (!row.weight_kg && !row.body_fat_pct && !row.skeletal_muscle_kg) throw new Error("Enter at least weight, body fat or muscle mass");
  const { error } = await db().from("body_scans").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/body");
  redirect("/body");
}

export async function deleteBodyScan(form: FormData) {
  const id = str(form, "id");
  if (id) await db().from("body_scans").delete().eq("id", id);
  revalidatePath("/body");
}

export interface SimChange {
  label: string;
  before: number | null;
  after: number | null;
}

/** Marks a session as a full/half HYROX sim (or not a sim) and returns how each category's prediction moved. */
export async function markSim(form: FormData): Promise<{ changes: SimChange[]; error?: string }> {
  const id = str(form, "id");
  const kind = str(form, "kind");
  const division = str(form, "division");
  if (!id || !kind || !["full", "half", "none", "auto"].includes(kind)) return { changes: [], error: "Pick full sim, half sim or not a sim" };
  if (division && !(division in DIVISIONS)) return { changes: [], error: "Unknown category" };
  const isSim = kind === "full" || kind === "half";
  const time = duration(form, "sim_time");
  const chosen = division ? [division as keyof typeof DIVISIONS] : [];
  const before = await currentHyroxPredictions(chosen).catch(() => ({}) as Record<string, number>);
  const { error } = await db()
    .from("activities")
    .update({ sim_kind: kind === "auto" ? null : kind, sim_time_s: isSim && time ? Math.round(time) : null, sim_division: isSim ? division : null })
    .eq("id", id);
  if (error) {
    const missing = /sim_kind|sim_time_s|sim_division/.test(error.message);
    return { changes: [], error: missing ? "Run supabase/schema.sql in Supabase first (adds the sim columns)." : error.message };
  }
  const after = await currentHyroxPredictions(chosen).catch(() => ({}) as Record<string, number>);
  revalidatePath("/", "layout");
  // The chosen category first, then any other category that moved (e.g. singles, when a doubles sim leaves it).
  const keys = [...new Set([division ?? "", ...Object.keys(after)])].filter((k) => k && (k === division || Math.round(after[k] ?? 0) !== Math.round(before[k] ?? 0)));
  return {
    changes: keys.map((k) => ({ label: DIVISIONS[k as keyof typeof DIVISIONS], before: before[k] ?? null, after: after[k] ?? null })),
  };
}
