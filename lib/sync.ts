import "server-only";
import { bestEfforts, decoupling, efficiencyFactor, sessionLoad, zoneSeconds, type AthleteProfile } from "./analysis";
import { db, getAthlete } from "./db";
import { getActivity, getStreams, isRun, listActivities, StravaRateLimitError, type StravaActivity } from "./strava";

const INITIAL_HISTORY_DAYS = 365;
// Strava allows 100 read requests / 15 min; leave room for listing and webhooks.
const MAX_STREAM_FETCHES_PER_SYNC = 40;

function toRow(a: StravaActivity, p: AthleteProfile) {
  const { load, method } = sessionLoad(
    { duration_s: a.moving_time || a.elapsed_time, avg_hr: a.average_heartrate, suffer_score: a.suffer_score },
    p,
  );
  return {
    source: "strava" as const,
    external_id: a.id,
    sport: a.sport_type || a.type,
    name: a.name,
    start_time: a.start_date,
    duration_s: a.elapsed_time,
    moving_s: a.moving_time,
    distance_m: a.distance || null,
    elevation_m: a.total_elevation_gain ?? null,
    avg_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    avg_speed: a.average_speed ?? null,
    avg_watts: a.average_watts ?? null,
    calories: a.calories ?? (a.kilojoules ? Math.round(a.kilojoules) : null),
    suffer_score: a.suffer_score ?? null,
    trainer: !!a.trainer,
    load,
    load_method: method,
    efficiency: isRun(a.sport_type) && a.average_heartrate && a.distance ? efficiencyFactor(a.distance, a.moving_time, a.average_heartrate) : null,
  };
}

/** Upserts one Strava activity (summary fields) and returns its row id. */
async function upsertActivity(a: StravaActivity, p: AthleteProfile): Promise<string> {
  const { data, error } = await db()
    .from("activities")
    .upsert(toRow(a, p), { onConflict: "external_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Fetches streams for one activity and stores zones, best efforts and decoupling. */
async function processStreams(rowId: string, externalId: number, sport: string, trainer: boolean, p: AthleteProfile) {
  const s = await getStreams(externalId);
  const time = s.time?.data ?? [];
  const dist = s.distance?.data ?? [];
  const hr = s.heartrate?.data ?? [];
  const update: Record<string, unknown> = { streams_fetched: true };
  if (hr.length) update.zone_seconds = zoneSeconds(time, hr, p.threshold_hr);
  // Treadmill distance comes from the watch's accelerometer, too rough for best efforts.
  if (isRun(sport) && dist.length && !trainer && sport !== "VirtualRun") update.best_efforts = bestEfforts(time, dist);
  if (isRun(sport) && hr.length && dist.length && time[time.length - 1] >= 40 * 60) update.decoupling = decoupling(time, dist, hr);
  const { error } = await db().from("activities").update(update).eq("id", rowId);
  if (error) throw error;
}

export interface SyncResult {
  imported: number;
  streamsProcessed: number;
  pendingStreams: number;
  rateLimited: boolean;
}

/** Imports new activities since the last sync, then backfills streams in batches. */
export async function syncStrava(): Promise<SyncResult> {
  const athlete = await getAthlete();
  const { data: auth } = await db().from("strava_auth").select("last_sync_at").eq("id", 1).single();
  const since = auth?.last_sync_at
    ? new Date(auth.last_sync_at).getTime() / 1000 - 3 * 86400 // overlap catches late uploads
    : Date.now() / 1000 - INITIAL_HISTORY_DAYS * 86400;

  let imported = 0;
  let rateLimited = false;
  try {
    for (let page = 1; ; page++) {
      const batch = await listActivities(Math.floor(since), page);
      if (!batch.length) break;
      const rows = batch.map((a) => toRow(a, athlete));
      const { error } = await db().from("activities").upsert(rows, { onConflict: "external_id" });
      if (error) throw error;
      imported += batch.length;
      if (batch.length < 100) break;
    }
    await db().from("strava_auth").update({ last_sync_at: new Date().toISOString() }).eq("id", 1);
  } catch (e) {
    if (!(e instanceof StravaRateLimitError)) throw e;
    rateLimited = true;
  }

  let streamsProcessed = 0;
  if (!rateLimited) {
    const { data: pending } = await db()
      .from("activities")
      .select("id, external_id, sport, trainer")
      .eq("source", "strava")
      .eq("streams_fetched", false)
      .order("start_time", { ascending: false })
      .limit(MAX_STREAM_FETCHES_PER_SYNC);
    for (const a of pending ?? []) {
      try {
        await processStreams(a.id, a.external_id, a.sport, a.trainer, athlete);
        streamsProcessed++;
      } catch (e) {
        if (e instanceof StravaRateLimitError) {
          rateLimited = true;
          break;
        }
        // Activities without streams (manual entries) — mark done so we don't retry forever.
        await db().from("activities").update({ streams_fetched: true }).eq("id", a.id);
      }
    }
  }

  const { count } = await db()
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("source", "strava")
    .eq("streams_fetched", false);
  return { imported, streamsProcessed, pendingStreams: count ?? 0, rateLimited };
}

/** Handles one webhook event for a single activity. */
export async function syncOneActivity(externalId: number): Promise<void> {
  const athlete = await getAthlete();
  const a = await getActivity(externalId);
  const id = await upsertActivity(a, athlete);
  await processStreams(id, a.id, a.sport_type, !!a.trainer, athlete);
}

export async function deleteStravaActivity(externalId: number): Promise<void> {
  await db().from("activities").delete().eq("external_id", externalId).eq("source", "strava");
}

/** Re-scores load for every activity after HR settings change. */
export async function recomputeLoads(): Promise<number> {
  const athlete = await getAthlete();
  const { data, error } = await db().from("activities").select("id, duration_s, moving_s, avg_hr, rpe, suffer_score");
  if (error) throw error;
  for (const a of data ?? []) {
    const { load, method } = sessionLoad({ duration_s: a.moving_s || a.duration_s, avg_hr: a.avg_hr, rpe: a.rpe, suffer_score: a.suffer_score }, athlete);
    await db().from("activities").update({ load, load_method: method }).eq("id", a.id);
  }
  return data?.length ?? 0;
}

/**
 * Re-imports summaries for the last year and re-analyses every run's streams
 * (e.g. after the best-effort logic changes). Runs through the normal rate-limited sync.
 */
export async function resetRunAnalysis(): Promise<void> {
  await db().from("strava_auth").update({ last_sync_at: null }).eq("id", 1);
  await db().from("activities").update({ streams_fetched: false, best_efforts: null }).eq("source", "strava").in("sport", ["Run", "TrailRun", "VirtualRun"]);
}
