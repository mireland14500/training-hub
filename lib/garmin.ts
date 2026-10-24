import "server-only";
import { db } from "@/lib/db";

/**
 * Garmin Connect sync from the web app — a TypeScript port of scripts/garmin_sync.py.
 *
 * Garmin has no public API, so this reuses the login tokens from the
 * `garminconnect` Python library. `npm run garmin` logs in once (with MFA if
 * needed) and saves them to the garmin_auth table; from then on the access
 * token is refreshed here and written back.
 */

const API = process.env.GARMIN_API_URL || "https://connectapi.garmin.com"; // override only for tests
const TOKEN_URL = process.env.GARMIN_TOKEN_URL || "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const TREADMILL_TYPES = new Set(["treadmill_running", "indoor_running", "virtual_run"]);

interface Tokens {
  di_token: string;
  di_refresh_token: string | null;
  di_client_id: string | null;
}

export class GarminNotConnectedError extends Error {}
export class GarminRateLimitError extends Error {}

// Same headers as the Garmin Connect Android app (what the Python library sends).
const NATIVE_HEADERS = {
  "User-Agent": "GCM-Android-5.23",
  "X-Garmin-User-Agent": "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0",
  "X-Garmin-Paired-App-Version": "10861",
  "X-Garmin-Client-Platform": "Android",
  "X-App-Ver": "10861",
  "X-Lang": "en",
  "X-GCExperience": "GC5",
  "Accept-Language": "en-US,en;q=0.9",
};

function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function jwtClientId(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).client_id ?? null;
  } catch {
    return null;
  }
}

class Garmin {
  constructor(
    private tokens: Tokens,
    public displayName: string | null,
  ) {}

  static async load(): Promise<Garmin> {
    const { data, error } = await db().from("garmin_auth").select("tokens, display_name").eq("id", 1).maybeSingle();
    if (error && !/garmin_auth/.test(error.message)) throw new Error(error.message);
    const tokens = data?.tokens as Tokens | undefined;
    if (!tokens?.di_token) throw new GarminNotConnectedError("Garmin isn't linked yet — run npm run garmin once on your computer.");
    return new Garmin(tokens, data?.display_name ?? null);
  }

  private async refresh(): Promise<void> {
    const { di_refresh_token: refresh, di_client_id: clientId } = this.tokens;
    if (!refresh || !clientId) throw new GarminNotConnectedError("Garmin login expired — run npm run garmin on your computer.");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        ...NATIVE_HEADERS,
        Authorization: "Basic " + Buffer.from(`${clientId}:`).toString("base64"),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh }),
      cache: "no-store",
    });
    if (res.status === 429) throw new GarminRateLimitError("Garmin rate limit — try again in an hour.");
    if (!res.ok) throw new GarminNotConnectedError(`Garmin login expired (${res.status}) — run npm run garmin on your computer.`);
    const body = await res.json();
    this.tokens = {
      di_token: body.access_token,
      di_refresh_token: body.refresh_token ?? refresh,
      di_client_id: jwtClientId(body.access_token) ?? clientId,
    };
    // Refresh tokens can rotate, so save straight away.
    await db().from("garmin_auth").update({ tokens: this.tokens, updated_at: new Date().toISOString() }).eq("id", 1);
  }

  async get<T = unknown>(path: string, params?: Record<string, string>, retried = false): Promise<T> {
    const exp = jwtExpiry(this.tokens.di_token);
    if (!retried && exp && Date.now() / 1000 > exp - 900) await this.refresh();
    const url = `${API}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
    const res = await fetch(url, {
      headers: { ...NATIVE_HEADERS, Authorization: `Bearer ${this.tokens.di_token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401 && !retried) {
      await this.refresh();
      return this.get(path, params, true);
    }
    if (res.status === 429) throw new GarminRateLimitError("Garmin rate limit — try again in an hour.");
    if (res.status === 204) return {} as T;
    if (!res.ok) throw new Error(`Garmin ${res.status} on ${path}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  async requireDisplayName(): Promise<string> {
    if (this.displayName) return this.displayName;
    const prof = await this.get<{ displayName?: string }>("/userprofile-service/socialProfile");
    if (!prof.displayName) throw new Error("Garmin profile has no display name");
    this.displayName = prof.displayName;
    await db().from("garmin_auth").update({ display_name: prof.displayName }).eq("id", 1);
    return prof.displayName;
  }
}

/** One Garmin endpoint; a failure skips that metric instead of the whole sync (rate limits still stop it). */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GarminRateLimitError || e instanceof GarminNotConnectedError) throw e;
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && v > 0 ? v : null);
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function dayMetrics(g: Garmin, name: string, d: string) {
  const [hrv, sleep, summary, readiness] = await Promise.all([
    safe(() => g.get<Json>(`/hrv-service/hrv/${d}`)),
    safe(() => g.get<Json>(`/wellness-service/wellness/dailySleepData/${name}`, { date: d, nonSleepBufferMinutes: "60" })),
    safe(() => g.get<Json>(`/usersummary-service/usersummary/daily/${name}`, { calendarDate: d })),
    safe(() => g.get<Json | Json[]>(`/metrics-service/metrics/trainingreadiness/${d}`)),
  ]);
  const dto = sleep?.dailySleepDTO ?? {};
  const secs = num(dto.sleepTimeSeconds);
  const ready = Array.isArray(readiness) ? readiness[readiness.length - 1] : readiness;
  const row: Record<string, number | null> = {
    hrv_ms: num(hrv?.hrvSummary?.lastNightAvg),
    sleep_score: num(dto.sleepScores?.overall?.value),
    sleep_hours: secs ? Math.round((secs / 3600) * 10) / 10 : null,
    resting_hr: num(summary?.restingHeartRate),
    body_battery: num(summary?.bodyBatteryAtWakeTime) ?? num(summary?.bodyBatteryHighestValue),
    training_readiness: num(ready?.score),
  };
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, k === "sleep_hours" ? v : Math.round(v!)]),
  );
}

async function athleteFields(g: Garmin, name: string, today: string) {
  const fields: Record<string, number | string> = {};
  const [lt, mm, preds] = await Promise.all([
    safe(() => g.get<Json[]>("/biometric-service/biometric/latestLactateThreshold")),
    safe(() => g.get<Json | Json[]>(`/metrics-service/metrics/maxmet/daily/${today}/${today}`)),
    safe(() => g.get<Json | Json[]>(`/metrics-service/metrics/racepredictions/latest/${name}`)),
  ]);

  // The threshold endpoint returns several near-identical entries; combine them.
  for (const e of Array.isArray(lt) ? lt : []) {
    let speed = num(e.speed);
    if (speed) {
      if (speed < 1.5) speed *= 10; // tenths of m/s on some accounts
      if (speed >= 2 && speed <= 7) fields.garmin_lt_speed = Math.round(speed * 1000) / 1000;
      if (e.calendarDate) fields.garmin_lt_date = String(e.calendarDate).slice(0, 10);
    }
    const hr = num(e.heartRate) ?? num(e.hearRate);
    if (hr) fields.garmin_lt_hr = Math.round(hr);
  }

  const entry = Array.isArray(mm) ? mm[0] : mm;
  const vo2 = num(entry?.generic?.vo2MaxPreciseValue) ?? num(entry?.generic?.vo2MaxValue);
  if (vo2) fields.garmin_vo2max = Math.round(vo2 * 10) / 10;

  const p = Array.isArray(preds) ? preds[preds.length - 1] : preds;
  const keys = { time5K: "garmin_pred_5k", time10K: "garmin_pred_10k", timeHalfMarathon: "garmin_pred_half", timeMarathon: "garmin_pred_marathon" };
  for (const [k, col] of Object.entries(keys)) if (num(p?.[k])) fields[col] = Math.round(p![k]);
  return fields;
}

/** Copies Garmin's load / Training Effect onto the matching Strava activities (start within 3 min). */
async function matchActivities(g: Garmin, start: string, end: string) {
  const garmin: Json[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const page = await safe(() => g.get<Json[]>("/activitylist-service/activities/search/activities", { startDate: start, endDate: end, start: String(offset), limit: "100" }));
    if (!Array.isArray(page) || !page.length) break;
    garmin.push(...page);
    if (page.length < 100) break;
  }
  const { data: ours } = await db()
    .from("activities")
    .select("id, start_time")
    .gte("start_time", `${start}T00:00:00Z`)
    .lte("start_time", `${end}T23:59:59Z`);
  const parsed = (ours ?? []).map((o) => ({ id: o.id as string, t: new Date(o.start_time).getTime() }));

  let matched = 0;
  for (const a of garmin) {
    if (!a.startTimeGMT) continue;
    const t = new Date(String(a.startTimeGMT).slice(0, 19).replace(" ", "T") + "Z").getTime();
    let best: (typeof parsed)[number] | null = null;
    for (const p of parsed) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    if (!best || Math.abs(best.t - t) > 180_000) continue;
    const typeKey = a.activityType?.typeKey ?? null;
    const fields: Record<string, unknown> = {
      garmin_load: num(a.activityTrainingLoad),
      garmin_te_aerobic: num(a.aerobicTrainingEffect),
      garmin_te_anaerobic: typeof a.anaerobicTrainingEffect === "number" ? a.anaerobicTrainingEffect : null,
      garmin_type: typeKey,
    };
    if (TREADMILL_TYPES.has(typeKey)) fields.trainer = true;
    await db()
      .from("activities")
      .update(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)))
      .eq("id", best.id);
    matched++;
  }
  return { matched, total: garmin.length };
}

export interface GarminSyncResult {
  days: number;
  matched: number;
  total: number;
  ltSpeed: number | null;
  vo2max: number | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Last 7 days of recovery (30 the first time), threshold/VO2max, and two weeks of activity loads. */
export async function syncGarmin(): Promise<GarminSyncResult> {
  const g = await Garmin.load();
  const name = await g.requireDisplayName();
  const { data: athlete } = await db().from("athlete").select("garmin_synced_at").eq("id", 1).maybeSingle();
  const { data: anyLoad } = await db().from("activities").select("id").not("garmin_load", "is", null).limit(1);

  const now = new Date();
  const span = athlete?.garmin_synced_at ? 7 : 30;
  const dates = Array.from({ length: span }, (_, i) => iso(new Date(now.getTime() - (span - 1 - i) * 86400_000)));

  // A few days at a time keeps Garmin happy and stays well inside the time limit.
  let days = 0;
  for (let i = 0; i < dates.length; i += 5) {
    const chunk = dates.slice(i, i + 5);
    const rows = await Promise.all(chunk.map(async (d) => ({ date: d, ...(await dayMetrics(g, name, d)) })));
    const filled = rows.filter((r) => Object.keys(r).length > 1);
    if (filled.length) {
      const { error } = await db().from("checkins").upsert(filled, { onConflict: "date" });
      if (error) throw new Error(error.message);
      days += filled.length;
    }
  }

  const fields = await athleteFields(g, name, iso(now));
  await db().from("athlete").update({ ...fields, garmin_synced_at: now.toISOString() }).eq("id", 1);

  const activityDays = anyLoad?.length ? 14 : 120;
  const { matched, total } = await matchActivities(g, iso(new Date(now.getTime() - activityDays * 86400_000)), iso(new Date(now.getTime() + 86400_000)));

  return {
    days,
    matched,
    total,
    ltSpeed: typeof fields.garmin_lt_speed === "number" ? fields.garmin_lt_speed : null,
    vo2max: typeof fields.garmin_vo2max === "number" ? fields.garmin_vo2max : null,
  };
}

export async function garminLinked(): Promise<boolean> {
  const { data } = await db().from("garmin_auth").select("id").eq("id", 1).maybeSingle();
  return !!data;
}
