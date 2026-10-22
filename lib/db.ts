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
  notes: string | null;
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
