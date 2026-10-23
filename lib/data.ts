import "server-only";
import {
  acwr,
  coachingCues,
  criticalSpeed,
  formatDuration,
  formatPace,
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
  type PmcPoint,
} from "./analysis";
import { db, getAthlete, type ActivityRow, type AthleteRow, type BenchmarkRow, type CheckinRow } from "./db";
import {
  bestErg1k,
  opportunities,
  predictHyrox,
  STATION_BY_KEY,
  STATIONS,
  benchmarkToRace,
  type Division,
  type ErgSession,
  type HyroxSession,
  type HyroxSplits,
  type Prediction,
} from "./hyrox";
import { categorize, weeklyPlan, type SessionSummary } from "./plan";
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
function shift(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return shift(date, -((d.getUTCDay() + 6) % 7)); // Monday
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

export async function getBenchmarks(sinceDays: number): Promise<BenchmarkRow[]> {
  const { data, error } = await db().from("benchmarks").select("*").gte("date", daysAgo(sinceDays)).order("date", { ascending: false });
  if (error) throw error;
  return data as BenchmarkRow[];
}

export const ERG_SPORTS = ["SkiErg", "RowErg", "BikeErg"] as const;
const ROW_SPORTS = ["RowErg", "VirtualRow", "Rowing"];

export function sportGroup(sport: string, name: string | null = null): "Run" | "Erg" | "HYROX & strength" | "Other" {
  const c = categorize(sport, name);
  if (c === "run") return "Run";
  if (c === "erg") return "Erg";
  if (c === "hyrox" || c === "strength") return "HYROX & strength";
  return "Other";
}

function isHardSession(a: ActivityRow): boolean {
  const z = a.zone_seconds;
  return (z ? z[3] + z[4] >= 600 : false) || (a.load ?? 0) >= 100 || (a.rpe ?? 0) >= 8;
}

// ---------------------------------------------------------------------------
// Running fitness estimate
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
  const raceAge = athlete.race_date ? Date.parse(refDate) - Date.parse(athlete.race_date) : NaN;
  if (athlete.race_distance_m && athlete.race_time_s && raceAge >= 0 && raceAge < 120 * 86400000) {
    candidates.push({ source: "Recent race result", vdot: round(vdotFromPerformance(athlete.race_distance_m, athlete.race_time_s), 1) });
  }

  if (athlete.threshold_pace_override) {
    const speed = 1000 / athlete.threshold_pace_override;
    return { vdot: round(vdotFromThresholdSpeed(speed), 1), thresholdSpeed: speed, source: "Manual threshold pace (Settings)", candidates, cs };
  }
  // Garmin's lactate threshold (from the watch's guided test or auto-detection), if recent.
  const ltAge = athlete.garmin_lt_date ? Date.parse(refDate) - Date.parse(athlete.garmin_lt_date) : NaN;
  if (athlete.garmin_lt_speed && ltAge >= 0 && ltAge < 120 * 86400000) {
    const speed = athlete.garmin_lt_speed;
    return { vdot: round(vdotFromThresholdSpeed(speed), 1), thresholdSpeed: speed, source: `Garmin lactate threshold (${athlete.garmin_lt_date})`, candidates, cs };
  }
  if (!candidates.length) return { vdot: null, thresholdSpeed: null, source: "Not enough data yet", candidates, cs };
  // A recent race is the most reliable; otherwise training efforts tend to underestimate, so take the best.
  const race = candidates.find((c) => c.source === "Recent race result");
  const chosen = race ?? candidates.reduce((a, b) => (b.vdot > a.vdot ? b : a));
  const thresholdSpeed = cs && chosen.source.startsWith("Critical") ? thresholdFromCs(cs.cs) : null;
  return { vdot: chosen.vdot, thresholdSpeed, source: chosen.source, candidates, cs };
}

/** Running VDOT as of a date, from the 90 days of runs before it. */
// Trends (useOverride = false) use only your runs, so they stay comparable over time.
function vdotAsOf(runs: ActivityRow[], athlete: AthleteRow, date: string, useOverride: boolean): number | null {
  const a = useOverride ? athlete : { ...athlete, threshold_pace_override: null, garmin_lt_speed: null };
  return estimate(a, bestEffortsWithin(runs, shift(date, -89), date), date).vdot;
}

function thresholdPaceFromVdot(vdot: number): number {
  const tp = trainingPaces(vdot).find((z) => z.name === "Threshold")!.range;
  return (tp[0] + tp[1]) / 2;
}

// ---------------------------------------------------------------------------
// HYROX prediction inputs
// ---------------------------------------------------------------------------

interface Everything {
  athlete: AthleteRow;
  activities: ActivityRow[];
  benchmarks: BenchmarkRow[];
  checkins: CheckinRow[];
}

async function loadEverything(): Promise<Everything> {
  const [athlete, activities, benchmarks, checkins] = await Promise.all([getAthlete(), getActivities(450), getBenchmarks(450), getCheckins(60)]);
  return { athlete, activities, benchmarks, checkins };
}

function ergSessions(activities: ActivityRow[], sports: string[]): ErgSession[] {
  return activities
    .filter((a) => sports.includes(a.sport) && a.distance_m && a.duration_s)
    .map((a) => {
      const workout = String((a.details as { workout?: string } | null)?.workout ?? a.name ?? "");
      return { date: localDate(a.start_time), distance_m: a.distance_m!, time_s: a.moving_s ?? a.duration_s, intervals: /\d\s*[x×]\s*\d/i.test(workout) };
    });
}

function hyroxSessions(e: Everything, runs: ActivityRow[]): HyroxSession[] {
  return e.activities
    .filter((a) => a.sport === "HYROX" && a.details)
    .map((a) => {
      const date = localDate(a.start_time);
      const vdot = vdotAsOf(runs, e.athlete, date, false);
      return { date, splits: a.details as unknown as HyroxSplits, tenKPaceAtTime: vdot ? predictTime(vdot, 10000) / 10 : null };
    });
}

function predictAt(e: Everything, runs: ActivityRow[], sims: HyroxSession[], date: string, useOverride: boolean): Prediction {
  const vdot = vdotAsOf(runs, e.athlete, date, useOverride);
  return predictHyrox({
    division: e.athlete.hyrox_division as Division,
    asOf: date,
    tenKPace: vdot ? predictTime(vdot, 10000) / 10 : null,
    skiSessions: ergSessions(e.activities, ["SkiErg"]),
    rowSessions: ergSessions(e.activities, ROW_SPORTS),
    benchmarks: e.benchmarks,
    hyroxSessions: sims,
  });
}

function dailyLoads(activities: ActivityRow[]): Map<string, number> {
  const daily = new Map<string, number>();
  for (const a of activities) {
    if (a.excluded) continue;
    const d = localDate(a.start_time);
    daily.set(d, (daily.get(d) ?? 0) + (a.load ?? 0));
  }
  return daily;
}

// ---------------------------------------------------------------------------
// Today (recovery + weekly plan)
// ---------------------------------------------------------------------------

export async function dashboardData() {
  const [e, strava] = await Promise.all([loadEverything(), db().from("strava_auth").select("athlete_name, last_sync_at").eq("id", 1).maybeSingle()]);
  const { athlete, activities, checkins } = e;
  const counted = activities.filter((a) => !a.excluded);
  const runs = activities.filter((a) => isRun(a.sport));

  const series = pmc(dailyLoads(activities), daysAgo(199), today());
  const latest = series[series.length - 1];
  const ratio = acwr(series);
  const mono = monotony(series);

  const todayCheckin = checkins.find((c) => c.date === today()) ?? null;
  const ready = readiness(latest?.tsb ?? null, todayCheckin, checkins);
  // Readiness for the last 3 days that have a check-in.
  const recentReady = [2, 1, 0]
    .map((n) => {
      const d = daysAgo(n);
      const c = checkins.find((x) => x.date === d);
      const p = series.find((x) => x.date === d);
      return c ? readiness(p?.tsb ?? null, c, checkins).score : null;
    })
    .filter((x): x is number => x !== null);

  const hardDays = new Set(counted.filter(isHardSession).map((a) => localDate(a.start_time)));
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

  const cues = coachingCues({ readiness: ready, tsb: latest?.tsb ?? null, acwr: ratio, monotony: mono, hardDaysInRow, daysSinceHard, intensityShareHard: hardShare });

  const goal =
    athlete.goal_date && athlete.goal_date >= today()
      ? { name: athlete.goal_name ?? "Goal race", date: athlete.goal_date, daysTo: Math.round((Date.parse(athlete.goal_date) - Date.parse(today())) / 86400000) }
      : null;

  const prediction = predictAt(e, runs, hyroxSessions(e, runs), today(), true);
  const vdot = vdotAsOf(runs, athlete, today(), true);

  const sessions: SessionSummary[] = counted
    .filter((a) => localDate(a.start_time) >= daysAgo(34))
    .map((a) => ({
      date: localDate(a.start_time),
      category: categorize(a.sport, a.name),
      load: a.load ?? 0,
      durationS: a.moving_s ?? a.duration_s,
      hard: isHardSession(a),
      quality: isRun(a.sport) && (((a.zone_seconds?.[3] ?? 0) + (a.zone_seconds?.[4] ?? 0) >= 600) || /tempo|threshold|interval|reps|\d\s*[x×]\s*\d|fartlek|track/i.test(a.name ?? "")),
    }));

  const plan = weeklyPlan({
    today: today(),
    pmc: series,
    acwr: ratio,
    readinessToday: todayCheckin ? ready.score : null,
    readinessRecent: recentReady,
    hardShare,
    sessions,
    daysToGoal: goal?.daysTo ?? null,
    thresholdPace: vdot ? formatPace(thresholdPaceFromVdot(vdot)) : null,
    weakStations: opportunities(prediction, 4).filter((o) => o.key !== "runs" && o.key !== "roxzone").map((o) => o.name.replace(/ \d.*$/, "")),
  });

  // Weekly load by type, last 12 weeks.
  const groups = ["Run", "Erg", "HYROX & strength", "Other"] as const;
  const weeks = new Map<string, Record<string, number>>();
  for (let i = 11; i >= 0; i--) weeks.set(weekStart(daysAgo(i * 7)), Object.fromEntries(groups.map((g) => [g, 0])));
  for (const a of counted) {
    const w = weeks.get(weekStart(localDate(a.start_time)));
    if (w) w[sportGroup(a.sport, a.name)] += a.load ?? 0;
  }

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
    plan,
    prediction,
    pmc: series.slice(-90),
    zones: zones.map((s) => Math.round(s / 60)),
    weekly: [...weeks.entries()].map(([week, v]) => ({ week: week.slice(5), ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x)])) })),
    wellness: checkins.slice(-30).map((c) => ({ date: c.date.slice(5), hrv: c.hrv_ms, rhr: c.resting_hr, sleep: c.sleep_score, bb: c.body_battery })),
    goal,
    recent: activities.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// HYROX page
// ---------------------------------------------------------------------------

export async function hyroxData() {
  const e = await loadEverything();
  const runs = e.activities.filter((a) => isRun(a.sport));
  const sims = hyroxSessions(e, runs);
  const prediction = predictAt(e, runs, sims, today(), true);
  const trend = [];
  for (let i = 12; i >= 0; i--) {
    const d = daysAgo(i * 14);
    const p = predictAt(e, runs, sims, d, false);
    trend.push({ date: d.slice(5), total: Math.round(p.total), confidence: p.confidence });
  }
  const sessions = e.activities.filter((a) => a.sport === "HYROX");
  return {
    athlete: e.athlete,
    prediction,
    opportunities: opportunities(prediction, 3),
    trend: trend.filter((t) => t.confidence > 0),
    sessions,
    benchmarks: e.benchmarks.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Progress ("am I getting fitter?")
// ---------------------------------------------------------------------------

export interface MetricTrend {
  key: string;
  name: string;
  unit: string;
  lowerIsBetter: boolean;
  format: "time" | "pace" | "number";
  points: { date: string; value: number | null }[];
  now: number | null;
  change6w: number | null; // positive = better
  change12w: number | null;
}

function trendOf(
  key: string,
  name: string,
  unit: string,
  format: MetricTrend["format"],
  lowerIsBetter: boolean,
  points: { date: string; value: number | null }[],
): MetricTrend {
  const v = (i: number) => points[points.length - 1 - i]?.value ?? null;
  const pct = (now: number | null, then: number | null) =>
    now !== null && then !== null && then !== 0 ? round(((lowerIsBetter ? then - now : now - then) / Math.abs(then)) * 100, 1) : null;
  const now = v(0);
  return { key, name, unit, lowerIsBetter, format, points, now, change6w: pct(now, v(3)), change12w: pct(now, v(6)) };
}

export async function progressData() {
  const e = await loadEverything();
  const runs = e.activities.filter((a) => isRun(a.sport));
  const sims = hyroxSessions(e, runs);
  const series: PmcPoint[] = pmc(dailyLoads(e.activities), daysAgo(449), today());
  const ski = ergSessions(e.activities, ["SkiErg"]);
  const row = ergSessions(e.activities, ROW_SPORTS);

  // Snapshot every 2 weeks for the last 26 weeks.
  const dates = Array.from({ length: 14 }, (_, i) => daysAgo((13 - i) * 14));
  const snap = dates.map((d) => {
    const vdot = vdotAsOf(runs, e.athlete, d, false);
    const p = predictAt(e, runs, sims, d, false);
    const win = (s: ErgSession[]) => bestErg1k(s.filter((x) => x.date <= d && x.date >= shift(d, -89)))?.time ?? null;
    const easy = runs.filter((r) => {
      const rd = localDate(r.start_time);
      return rd <= d && rd >= shift(d, -27) && r.efficiency && r.avg_hr && r.avg_hr < e.athlete.threshold_hr * 0.9;
    });
    return {
      date: d,
      hyrox: p.confidence > 0 ? Math.round(p.total) : null,
      vdot,
      threshold: vdot ? Math.round(thresholdPaceFromVdot(vdot)) : null,
      ctl: series.find((x) => x.date === d)?.ctl ?? null,
      ski: win(ski),
      row: win(row),
      ef: easy.length >= 2 ? round(easy.reduce((a, r) => a + r.efficiency!, 0) / easy.length, 3) : null,
    };
  });
  const pts = (k: keyof (typeof snap)[number]) => snap.map((s) => ({ date: s.date.slice(5), value: s[k] as number | null }));

  const metrics: MetricTrend[] = [
    trendOf("hyrox", "Predicted HYROX time", "", "time", true, pts("hyrox")),
    trendOf("threshold", "Threshold pace", "/km", "pace", true, pts("threshold")),
    trendOf("vdot", "Running fitness (VDOT)", "", "number", false, pts("vdot")),
    trendOf("ctl", "Training fitness (CTL)", "", "number", false, pts("ctl")),
    trendOf("ef", "Easy-run efficiency", "m/min/bpm", "number", false, pts("ef")),
    trendOf("ski", "SkiErg 1 km (equivalent)", "", "time", true, pts("ski")),
    trendOf("row", "Row 1 km (equivalent)", "", "time", true, pts("row")),
  ].filter((m) => m.points.some((p) => p.value !== null));

  // Station benchmarks: race-equivalent times, first vs latest.
  const division = e.athlete.hyrox_division as Division;
  const stations = STATIONS.map((st) => {
    const list = e.benchmarks
      .filter((b) => b.station === st.key)
      .map((b) => ({ date: b.date, time: Math.round(benchmarkToRace(b, division)) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { key: st.key, name: st.name, history: list, first: list[0] ?? null, latest: list[list.length - 1] ?? null };
  }).filter((s) => s.history.length > 0);

  // Overall verdict from the key metrics' 6-week change.
  const changes = metrics.filter((m) => ["hyrox", "threshold", "ctl", "ef", "ski", "row"].includes(m.key) && m.change6w !== null);
  const better = changes.filter((m) => m.change6w! > 1).length;
  const worse = changes.filter((m) => m.change6w! < -1).length;
  const verdict =
    changes.length === 0
      ? { label: "Not enough data yet", tone: "muted" as const, text: "Sync a few weeks of training and log some SkiErg/Row sessions and station benchmarks." }
      : better > worse
        ? { label: "Yes — you're getting fitter", tone: "good" as const, text: `${better} of ${changes.length} key markers improved over the last 6 weeks.` }
        : worse > better
          ? { label: "Fitness is slipping", tone: "bad" as const, text: `${worse} of ${changes.length} key markers got worse over the last 6 weeks. Check consistency and recovery.` }
          : { label: "Holding steady", tone: "warn" as const, text: "Your markers are broadly flat over the last 6 weeks. To progress, add load gradually (see Today)." };

  return { metrics, stations, verdict };
}

// ---------------------------------------------------------------------------
// Running page
// ---------------------------------------------------------------------------

export async function runningData() {
  const [athlete, activities] = await Promise.all([getAthlete(), getActivities(400)]);
  const runs = activities.filter((a) => isRun(a.sport));

  const efforts = bestEffortsWithin(runs, daysAgo(89), today());
  const est = estimate(athlete, efforts, today());
  const thresholdPace = est.thresholdSpeed ? 1000 / est.thresholdSpeed : est.vdot ? thresholdPaceFromVdot(est.vdot) : null;

  // Threshold trend: 90-day rolling estimate, sampled every 2 weeks over the last year.
  const trend: { date: string; pace: number | null; vdot: number | null }[] = [];
  for (let i = 26; i >= 0; i--) {
    const end = daysAgo(i * 14);
    const vdot = vdotAsOf(runs, athlete, end, false);
    if (vdot) trend.push({ date: end.slice(5), pace: Math.round(thresholdPaceFromVdot(vdot)), vdot });
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
// Ergs (SkiErg / RowErg / BikeErg)
// ---------------------------------------------------------------------------

const ERG_PB_DISTANCES = [500, 1000, 2000, 5000];

export async function ergData() {
  const { data, error } = await db()
    .from("activities")
    .select("*")
    .in("sport", [...ERG_SPORTS])
    .order("start_time", { ascending: false })
    .limit(300);
  if (error) throw error;
  const sessions = data as ActivityRow[];
  const machines = ERG_SPORTS.map((m) => {
    const list = sessions.filter((s) => s.sport === m);
    const pbs = ERG_PB_DISTANCES.map((d) => {
      const matches = list.filter((s) => s.distance_m && Math.abs(s.distance_m - d) < 1 && s.duration_s);
      const best = matches.reduce<ActivityRow | null>((a, b) => (!a || b.duration_s < a.duration_s ? b : a), null);
      return { distance: d, time: best?.duration_s ?? null, date: best ? localDate(best.start_time) : null };
    });
    const trend = list
      .filter((s) => s.distance_m && s.duration_s)
      .map((s) => ({ date: localDate(s.start_time), pace500: round((s.duration_s / s.distance_m!) * 500, 1) }))
      .reverse();
    return { machine: m, count: list.length, metres: list.reduce((a, s) => a + (s.distance_m ?? 0), 0), pbs, trend };
  }).filter((m) => m.count > 0);
  return { sessions, machines };
}

export { STATION_BY_KEY };

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/** Recent Garmin/Strava recordings without GPS distance that could be the session being logged. */
export async function linkCandidates(): Promise<{ id: string; label: string }[]> {
  const { data } = await db()
    .from("activities")
    .select("id, name, sport, start_time, duration_s, avg_hr, distance_m")
    .eq("source", "strava")
    .eq("excluded", false)
    .gte("start_time", new Date(Date.now() - 3 * 86400000).toISOString())
    .order("start_time", { ascending: false });
  return (data ?? [])
    .filter((a) => !a.distance_m || !isRun(a.sport))
    .map((a) => ({
      id: a.id,
      label: `${localDate(a.start_time)} · ${a.name} · ${formatDuration(a.duration_s)}${a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}`,
    }));
}
