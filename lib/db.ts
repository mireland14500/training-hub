import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Server-only Supabase client using the service-role key. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export interface SegmentalLean {
  right_arm: number | null;
  left_arm: number | null;
  trunk: number | null;
  right_leg: number | null;
  left_leg: number | null;
}

export interface BodyScanRow {
  id: string;
  date: string;
  weight_kg: number | null;
  skeletal_muscle_kg: number | null;
  body_fat_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  total_body_water_l: number | null;
  visceral_fat_level: number | null;
  bmr_kcal: number | null;
  inbody_score: number | null;
  segmental_lean: SegmentalLean | null;
  photo_path: string | null;
  notes: string | null;
}

export interface ActivityRow {
  id: string;
  source: "strava" | "ski_photo" | "manual";
  external_id: number | null;
  sport: string;
  name: string | null;
  start_time: string;
  duration_s: number;
  moving_s: number | null;
  distance_m: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed: number | null;
  avg_watts: number | null;
  calories: number | null;
  rpe: number | null;
  suffer_score: number | null;
  load: number | null;
  load_method: string | null;
  zone_seconds: number[] | null;
  best_efforts: Record<string, number> | null;
  efficiency: number | null;
  decoupling: number | null;
  streams_fetched: boolean;
  details: Record<string, unknown> | null;
  photo_path: string | null;
  linked_activity_id: string | null;
  excluded: boolean;
  trainer: boolean;
  focus: string | null;
  entries: import("./workout").Entry[] | null;
  garmin_load: number | null;
  garmin_te_aerobic: number | null;
  garmin_te_anaerobic: number | null;
  garmin_type: string | null;
  strava_best_efforts: Record<string, number> | null;
  notes: string | null;
  /** Your call on whether this was a HYROX sim ("none" = not a sim, overriding the name). */
  sim_kind?: "full" | "half" | "none" | null;
  /** Sim finish time when the recording includes a warm-up etc. */
  sim_time_s?: number | null;
}

export interface AthleteRow {
  sex: "male" | "female";
  max_hr: number;
  resting_hr: number;
  threshold_hr: number;
  threshold_pace_override: number | null;
  race_distance_m: number | null;
  race_time_s: number | null;
  race_date: string | null;
  goal_name: string | null;
  goal_date: string | null;
  goal_distance_m: number | null;
  hyrox_division: "open_men" | "open_women" | "pro_men" | "pro_women";
  garmin_lt_speed: number | null;
  garmin_lt_hr: number | null;
  garmin_lt_date: string | null;
  garmin_vo2max: number | null;
  garmin_synced_at: string | null;
  garmin_pred_5k: number | null;
  garmin_pred_10k: number | null;
  garmin_pred_half: number | null;
  garmin_pred_marathon: number | null;
  garmin_load_scale: number | null;
  show_predictions: boolean;
}

export interface BenchmarkRow {
  id: string;
  date: string;
  station: "ski" | "sled_push" | "sled_pull" | "bbj" | "row" | "farmers" | "lunges" | "wall_balls";
  time_s: number;
  amount: number | null;
  load_kg: number | null;
  fresh: boolean;
  notes: string | null;
}

export interface CheckinRow {
  date: string;
  sleep_score: number | null;
  sleep_hours: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  body_battery: number | null;
  training_readiness: number | null;
  soreness: number | null;
  energy: number | null;
  notes: string | null;
}

export async function getAthlete(): Promise<AthleteRow> {
  const { data, error } = await db().from("athlete").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as AthleteRow;
}

export interface TimeOffRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: "ill" | "injury" | "holiday" | "other";
  notes: string | null;
}
