import "server-only";
import { db } from "./db";

const API = "https://www.strava.com/api/v3";

export function stravaAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    redirect_uri: `${requireEnv("APP_URL")}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("STRAVA_CLIENT_ID"),
      client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Strava token error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(code: string): Promise<void> {
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  const { error } = await db()
    .from("strava_auth")
    .upsert({
      id: 1,
      athlete_id: t.athlete?.id ?? null,
      athlete_name: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ") || null,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/** Returns a valid access token, refreshing it if it expires within 5 minutes. */
async function accessToken(): Promise<string> {
  const { data, error } = await db().from("strava_auth").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Strava is not connected");
  if (data.expires_at > Date.now() / 1000 + 300) return data.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await db()
    .from("strava_auth")
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return t.access_token;
}

export class StravaRateLimitError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: "no-store" });
  if (res.status === 429) throw new StravaRateLimitError("Strava rate limit reached — sync will continue later");
  if (!res.ok) throw new Error(`Strava ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  average_watts?: number;
  kilojoules?: number;
  calories?: number;
  suffer_score?: number | null;
  has_heartrate: boolean;
  trainer?: boolean;
  /** Only on the detailed activity (GET /activities/:id) for runs. */
  best_efforts?: { name: string; elapsed_time: number; moving_time: number; distance: number; pr_rank: number | null }[];
}

export function listActivities(afterEpoch: number, page: number): Promise<StravaActivity[]> {
  return get(`/athlete/activities?after=${afterEpoch}&per_page=100&page=${page}`);
}

export function getActivity(id: number): Promise<StravaActivity> {
  return get(`/activities/${id}`);
}

export interface Streams {
  time?: { data: number[] };
  distance?: { data: number[] };
  heartrate?: { data: number[] };
}

export function getStreams(id: number): Promise<Streams> {
  return get(`/activities/${id}/streams?keys=time,distance,heartrate&key_by_type=true`);
}

export function isRun(sportType: string): boolean {
  return ["Run", "TrailRun", "VirtualRun"].includes(sportType);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}
