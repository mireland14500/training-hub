"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pace500FromWatts, sessionLoad } from "@/lib/analysis";
import { db, getAthlete } from "@/lib/db";
import { recomputeLoads } from "@/lib/sync";

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
    goal_distance_m: num(form, "goal_distance_m"),
  };
  const { error } = await db().from("athlete").upsert(row);
  if (error) throw error;
  if (row.max_hr !== before.max_hr || row.resting_hr !== before.resting_hr || row.threshold_hr !== before.threshold_hr || row.sex !== before.sex) {
    await recomputeLoads();
  }
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function saveSkiSession(form: FormData) {
  const athlete = await getAthlete();
  const durationS = duration(form, "time");
  if (!durationS) throw new Error("Time is required");
  const distance = num(form, "distance_m");
  const watts = num(form, "avg_watts");
  const pace500 = duration(form, "pace_500") ?? (distance ? (durationS / distance) * 500 : watts ? pace500FromWatts(watts) : null);
  const rpe = num(form, "rpe");
  const linkedId = str(form, "linked_activity_id");

  // Use HR from the linked Garmin/Strava recording if one is chosen and no HR was typed.
  let avgHr = num(form, "avg_hr");
  let maxHr: number | null = null;
  let zoneSeconds: number[] | null = null;
  if (linkedId) {
    const { data: linked } = await db().from("activities").select("avg_hr, max_hr, zone_seconds").eq("id", linkedId).single();
    avgHr ??= linked?.avg_hr ?? null;
    maxHr = linked?.max_hr ?? null;
    zoneSeconds = linked?.zone_seconds ?? null;
  }
  const { load, method } = sessionLoad({ duration_s: durationS, avg_hr: avgHr, rpe }, athlete);

  let splits: unknown = [];
  try {
    splits = JSON.parse(String(form.get("splits") ?? "[]"));
  } catch {}

  const { error } = await db().from("activities").insert({
    source: str(form, "photo_path") ? "ski_photo" : "manual",
    sport: "SkiErg",
    name: str(form, "name") ?? `SkiErg ${str(form, "workout") ?? ""}`.trim(),
    // Browser-computed ISO time, so the session lands on the right local day.
    start_time: str(form, "start_iso") ?? new Date().toISOString(),
    duration_s: Math.round(durationS),
    moving_s: Math.round(durationS),
    distance_m: distance,
    avg_hr: avgHr,
    max_hr: maxHr,
    avg_speed: distance ? distance / durationS : null,
    avg_watts: watts,
    calories: num(form, "calories"),
    rpe,
    load,
    load_method: method,
    zone_seconds: zoneSeconds,
    details: { workout: str(form, "workout"), pace_500m_s: pace500, stroke_rate: num(form, "stroke_rate"), splits },
    photo_path: str(form, "photo_path"),
    linked_activity_id: linkedId,
    notes: str(form, "notes"),
    streams_fetched: true,
  });
  if (error) throw error;
  // The Garmin recording of the same session no longer counts separately.
  if (linkedId) await db().from("activities").update({ excluded: true }).eq("id", linkedId);
  revalidatePath("/", "layout");
  redirect("/ski");
}

export async function setRpe(id: string, rpe: number) {
  const athlete = await getAthlete();
  const { data } = await db().from("activities").select("duration_s, moving_s, avg_hr, suffer_score").eq("id", id).single();
  if (!data) return;
  const { load, method } = sessionLoad({ duration_s: data.moving_s || data.duration_s, avg_hr: data.avg_hr, rpe, suffer_score: data.suffer_score }, athlete);
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
