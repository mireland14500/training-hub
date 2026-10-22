import "server-only";
import {
  acwr,
  coachingCues,
  criticalSpeed,
  monotony,
  pmc,
  predictTime,
  readiness,
  thresholdFromCs,
  trainingPaces,
  vdotFromPerformance,
  vdotFromThresholdSpeed,
  EFFORT_DURATIONS,
  round,
} from "./analysis";
import { db, getAthlete, type ActivityRow, type AthleteRow, type CheckinRow } from "./db";
import { isRun } from "./strava";

const TZ = process.env.APP_TIMEZONE || "UTC";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date (YYYY-MM-DD) in the app's time zone. */
export function localDate(d: Date | string): string {
  return dayFmt.format(typeof d === "string" ? new Date(d) : d);
}
export function today(): string {
  return localDate(new Date());
}
function daysAgo(n: number): string {
  return localDate(new Date(Date.now() - n * 86400000));
}
function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function getActivities(sinceDays: number): Promise<ActivityRow[]> {
  const { data, error } = await db()
    .from("activities")
    .select("*")
    .gte("start_time", new Date(Date.now() - sinceDays * 86400000).toISOString())
    .order("start_time", { ascending: false });
  if (error) throw error;
  return data as ActivityRow[];
}

export async function getCheckins(sinceDays: number): Promise<CheckinRow[]> {
  const { data, error } = await db().from("checkins").select("*").gte("date", daysAgo(sinceDays)).order("date");
  if (error) throw error;
  return data as CheckinRow[];
}

export function sportGroup(sport: string): "Run" | "SkiErg" | "Ride" | "Other" {
  if (isRun(sport)) return "Run";
  if (/ski/i.test(sport)) return "SkiErg";
  if (/ride|bike|cycl/i.test(sport)) return "Ride";
  return "Other";
}

// ---------------------------------------------------------------------------
// Recovery dashboard
// ---------------------------------------------------------------------------

export async function dashboardData() {
  const [athlete, activities, checkins, strava] = await Promise.all([
    getAthlete(),
    getActivities(200),
    getCheckins(60),
    db().from("strava_auth").select("athlete_name, last_sync_at").eq("id", 1).maybeSingle(),
  ]);
  const counted = activities.filter((a) => !a.excluded);

  const daily = new Map<string, number>();
  const hardDays = new Set<string>();
  for (const a of counted) {
    const d = localDate(a.start_time);
    daily.set(d, (daily.get(d) ?? 0) + (a.load ?? 0));
    const hardZone = a.zone_seconds ? a.zone_seconds[3] + a.zone_seconds[4] >= 600 : false;
    if (hardZone || (a.load ?? 0) >= 100 || (a.rpe ?? 0) >= 8) hardDays.add(d);
  }

  const series = pmc(daily, daysAgo(199), today());
  const latest = series[series.length - 1];
  const ratio = acwr(series);
  const mono = monotony(series);

  const todayCheckin = checkins.find((c) => c.date === today()) ?? null;
  const ready = readiness(latest?.tsb ?? null, todayCheckin, checkins);

  let hardDaysInRow = 0;
  for (let i = 1; i <= 7 && hardDays.has(daysAgo(i)); i++) hardDaysInRow++;
  let daysSinceHard: number | null = null;
  for (let i = 0; i <= 30; i++) if (hardDays.has(daysAgo(i))) { daysSinceHard = i; break; }

  // Intensity distribution, last 28 days (HR-zone time).
  const zones = [0, 0, 0, 0, 0];
  for (const a of counted) {
    if (a.zone_seconds && localDate(a.start_time) >= daysAgo(27)) a.zone_seconds.forEach((s, i) => (zones[i] += s));
  }
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const hardShare = zoneTotal > 0 ? (zones[2] + zones[3] + zones[4]) / zoneTotal : null;

  const cues = coachingCues({
    readiness: ready,
    tsb: latest?.tsb ?? null,
    acwr: ratio,
    monotony: mono,
    hardDaysInRow,
    daysSinceHard,
    intensityShareHard: hardShare,
  });

  // Weekly load by sport, last 12 weeks.
  const weeks = new Map<string, Record<string, number>>();
  for (let i = 11; i >= 0; i--) weeks.set(weekStart(daysAgo(i * 7)), { Run: 0, SkiErg: 0, Ride: 0, Other: 0 });
  for (const a of counted) {
    const w = weeks.get(weekStart(localDate(a.start_time)));
    if (w) w[sportGroup(a.sport)] += a.load ?? 0;
  }

  const goal =
    athlete.goal_date && athlete.goal_date >= today()
      ? { name: athlete.goal_name ?? "Goal race", date: athlete.goal_date, daysTo: Math.round((Date.parse(athlete.goal_date) - Date.parse(today())) / 86400000) }
      : null;

  return {
    athlete,
    stravaConnected: !!strava.data,
    lastSync: strava.data?.last_sync_at ?? null,
    hasActivities: activities.length > 0,
    readiness: ready,
    checkedInToday: !!todayCheckin,
    today: latest,
    acwr: ratio,
    monotony: mono,
    cues,
    pmc: series.slice(-90),
    zones: zones.map((s) => Math.round(s / 60)),
    weekly: [...weeks.entries()].map(([week, v]) => ({ week: week.slice(5), ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x)])) })),
    wellness: checkins.slice(-30).map((c) => ({ date: c.date.slice(5), hrv: c.hrv_ms, rhr: c.resting_hr, sleep: c.sleep_score, bb: c.body_battery })),
    goal,
    recent: activities.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Running analysis
// ---------------------------------------------------------------------------

export const RACES = [
  { name: "5K", m: 5000 },
  { name: "10K", m: 10000 },
  { name: "Half marathon", m: 21097.5 },
  { name: "Marathon", m: 42195 },
];

function bestEffortsWithin(runs: ActivityRow[], fromDate: string, toDate: string): Record<string, number> {
  const best: Record<string, number> = {};
  for (const r of runs) {
    const d = localDate(r.start_time);
    if (d < fromDate || d > toDate || !r.best_efforts) continue;
    for (const [k, v] of Object.entries(r.best_efforts)) best[k] = Math.max(best[k] ?? 0, v);
  }
  return best;
}

interface ThresholdEstimate {
  vdot: number | null;
  thresholdSpeed: number | null; // m/s
  source: string;
  candidates: { source: string; vdot: number }[];
  cs: { cs: number; dPrime: number } | null;
}

function estimate(athlete: AthleteRow, efforts: Record<string, number>, refDate: string): ThresholdEstimate {
  const candidates: { source: string; vdot: number }[] = [];
  const cs = criticalSpeed(efforts);
  if (cs) candidates.push({ source: "Critical speed (3–20 min best efforts)", vdot: round(vdotFromThresholdSpeed(thresholdFromCs(cs.cs)), 1) });
  for (const t of ["1200", "1800", "3600"]) {
    if (efforts[t]) candidates.push({ source: `Best ${Number(t) / 60}-min effort`, vdot: round(vdotFromPerformance(efforts[t], Number(t)), 1) });
  }
  const raceRecent =
    athlete.race_distance_m && athlete.race_time_s && athlete.race_date && Date.parse(refDate) - Date.parse(athlete.race_date) < 120 * 86400000;
  if (raceRecent) candidates.push({ source: "Recent race result", vdot: round(vdotFromPerformance(athlete.race_distance_m!, athlete.race_time_s!), 1) });

  if (athlete.threshold_pace_override) {
    const speed = 1000 / athlete.threshold_pace_override;
    return { vdot: round(vdotFromThresholdSpeed(speed), 1), thresholdSpeed: speed, source: "Manual threshold pace (Settings)", candidates, cs };
  }
  // Priority: race > critical speed > best long effort.
  const pick = candidates.find((c) => c.source === "Recent race result") ?? candidates[0] ?? null;
  if (!pick) return { vdot: null, thresholdSpeed: null, source: "Not enough data yet", candidates, cs };
  // Training efforts tend to underestimate: if a long effort implies a higher VDOT, use it.
  const best = candidates.reduce((a, b) => (b.vdot > a.vdot ? b : a));
  const chosen = pick.source === "Recent race result" ? pick : best;
  const thresholdSpeed = cs && chosen.source.startsWith("Critical") ? thresholdFromCs(cs.cs) : null;
  return { vdot: chosen.vdot, thresholdSpeed, source: chosen.source, candidates, cs };
}

export async function runningData() {
  const [athlete, activities] = await Promise.all([getAthlete(), getActivities(400)]);
  const runs = activities.filter((a) => isRun(a.sport));

  const efforts = bestEffortsWithin(runs, daysAgo(89), today());
  const est = estimate(athlete, efforts, today());
  const thresholdPace = est.thresholdSpeed
    ? 1000 / est.thresholdSpeed
    : est.vdot
      ? trainingPaces(est.vdot).find((z) => z.name === "Threshold")!.range.reduce((a, b) => a + b) / 2
      : null;

  // Threshold trend: 90-day rolling estimate, sampled every 2 weeks over the last year.
  const trend: { date: string; pace: number | null; vdot: number | null }[] = [];
  for (let i = 26; i >= 0; i--) {
    const end = daysAgo(i * 14);
    const e = estimate({ ...athlete, threshold_pace_override: null }, bestEffortsWithin(runs, daysAgo(i * 14 + 89), end), end);
    if (e.vdot) {
      const tp = trainingPaces(e.vdot).find((z) => z.name === "Threshold")!.range;
      trend.push({ date: end.slice(5), pace: Math.round((tp[0] + tp[1]) / 2), vdot: e.vdot });
    }
  }

  // Weekly volume, last 16 weeks.
  const weeks = new Map<string, { km: number; longest: number; runs: number }>();
  for (let i = 15; i >= 0; i--) weeks.set(weekStart(daysAgo(i * 7)), { km: 0, longest: 0, runs: 0 });
  for (const r of runs) {
    const w = weeks.get(weekStart(localDate(r.start_time)));
    if (!w) continue;
    const km = (r.distance_m ?? 0) / 1000;
    w.km += km;
    w.longest = Math.max(w.longest, km);
    w.runs++;
  }

  // Aerobic efficiency trend on easy runs (avg HR below Z3).
  const efficiency = runs
    .filter((r) => r.efficiency && r.avg_hr && r.avg_hr < athlete.threshold_hr * 0.9 && (r.moving_s ?? 0) >= 1200)
    .map((r) => ({ date: localDate(r.start_time), ef: r.efficiency!, name: r.name }))
    .reverse();

  const longRuns = runs.filter((r) => r.decoupling != null).slice(0, 8);

  return {
    athlete,
    hasRuns: runs.length > 0,
    estimate: est,
    thresholdPace,
    paces: est.vdot ? trainingPaces(est.vdot) : [],
    predictions: est.vdot ? RACES.map((r) => ({ ...r, time: predictTime(est.vdot!, r.m) })) : [],
    goalPrediction:
      est.vdot && athlete.goal_distance_m ? { name: athlete.goal_name ?? "Goal", time: predictTime(est.vdot, athlete.goal_distance_m) } : null,
    efforts: EFFORT_DURATIONS.filter((d) => efforts[String(d)]).map((d) => ({
      duration: d,
      distance: efforts[String(d)],
      pace: d / (efforts[String(d)] / 1000),
    })),
    trend,
    weekly: [...weeks.entries()].map(([week, v]) => ({ week: week.slice(5), km: round(v.km, 1), longest: round(v.longest, 1), runs: v.runs })),
    efficiency,
    longRuns,
    recent: runs.slice(0, 15),
  };
}

// ---------------------------------------------------------------------------
// SkiErg
// ---------------------------------------------------------------------------

const SKI_PB_DISTANCES = [500, 1000, 2000, 5000];

export async function skiData() {
  const { data, error } = await db()
    .from("activities")
    .select("*")
    .in("source", ["ski_photo", "manual"])
    .order("start_time", { ascending: false })
    .limit(200);
  if (error) throw error;
  const sessions = (data as ActivityRow[]).filter((a) => sportGroup(a.sport) === "SkiErg");
  const pbs = SKI_PB_DISTANCES.map((m) => {
    const matches = sessions.filter((s) => s.distance_m && Math.abs(s.distance_m - m) < 1 && s.duration_s);
    const best = matches.reduce<ActivityRow | null>((a, b) => (!a || b.duration_s < a.duration_s ? b : a), null);
    return { distance: m, time: best?.duration_s ?? null, date: best ? localDate(best.start_time) : null };
  });
  const trend = sessions
    .filter((s) => s.distance_m && s.duration_s)
    .map((s) => ({ date: localDate(s.start_time), pace500: round((s.duration_s / s.distance_m!) * 500, 1), watts: s.avg_watts }))
    .reverse();
  const totals = {
    sessions: sessions.length,
    metres: sessions.reduce((a, s) => a + (s.distance_m ?? 0), 0),
    calories: sessions.reduce((a, s) => a + (s.calories ?? 0), 0),
  };
  return { sessions, pbs, trend, totals };
}
