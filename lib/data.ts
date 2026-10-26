import "server-only";
import {
  acwr,
  coachingCues,
  criticalSpeed,
  formatDuration,
  formatPace,
  hrZoneBounds,
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
import { db, getAthlete, type ActivityRow, type AthleteRow, type BenchmarkRow, type CheckinRow, type TimeOffRow } from "./db";
import {
  bestErg1k,
  opportunities,
  predictHyrox,
  DIVISIONS,
  isDoubles,
  STATION_BY_KEY,
  STATIONS,
  benchmarkToRace,
  type Division,
  type ErgSession,
  type HyroxSession,
  type HyroxSplits,
  type Benchmark,
  type Prediction,
  simKind,
  SIM_NAME,
  DOUBLES_NAME,
} from "./hyrox";
import { categorize, timeOffStatus, weeklyPlan, type SessionSummary, type TimeOff } from "./plan";
import { recoveryStatus, todayCall, type RecoveryDay } from "./recovery";
import { paceAtHr, weeklyMedian, windowChange } from "./running";
import {
  addEntryVolumes,
  benchmarksFromEntries,
  bestTemplate,
  emptyVolumes,
  entryPace,
  entryTags,
  ergSessionsFromEntries,
  summarize,
  type SessionKey,
  type Template,
  type Volumes,
} from "./workout";
import { isRun } from "./strava";
import { applyGarminLoadsIfNeeded } from "./sync";

const TZ = process.env.APP_TIMEZONE || "UTC";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date (YYYY-MM-DD) in the app's time zone. */
export function localDate(d: Date | string): string {
  return dayFmt.format(typeof d === "string" ? new Date(d) : d);
}
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false });

/** What identifies a recurring session (for "same as last week?"). */
function sessionKey(a: Pick<ActivityRow, "id" | "name" | "sport" | "start_time">): SessionKey {
  const date = localDate(a.start_time);
  return {
    id: a.id,
    name: a.name,
    sport: a.sport,
    date,
    weekday: new Date(date + "T00:00:00Z").getUTCDay(),
    hour: Number(hourFmt.format(new Date(a.start_time))) % 24,
  };
}

/** Earlier sessions with details filled in, newest first (templates to copy from). */
export async function getTemplates(): Promise<Template[]> {
  const { data } = await db()
    .from("activities")
    .select("id, name, sport, start_time, entries, focus")
    .not("entries", "is", null)
    .gte("start_time", new Date(Date.now() - 180 * 86400000).toISOString())
    .order("start_time", { ascending: false })
    .limit(200);
  return ((data ?? []) as Pick<ActivityRow, "id" | "name" | "sport" | "start_time" | "entries" | "focus">[])
    .filter((a) => a.entries?.length)
    .map((a) => ({ ...sessionKey(a), entries: a.entries!, focus: a.focus }));
}

export function today(): string {
  return localDate(new Date());
}
export function daysAgo(n: number): string {
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

export async function getTimeOff(sinceDays: number): Promise<TimeOff[]> {
  const { data, error } = await db().from("time_off").select("*").gte("end_date", daysAgo(sinceDays)).order("start_date");
  if (error) throw error;
  return ((data ?? []) as TimeOffRow[]).map((t) => ({ start: t.start_date, end: t.end_date, reason: t.reason, id: t.id }));
}

export async function getBenchmarks(sinceDays: number): Promise<BenchmarkRow[]> {
  const { data, error } = await db().from("benchmarks").select("*").gte("date", daysAgo(sinceDays)).order("date", { ascending: false });
  if (error) throw error;
  return data as BenchmarkRow[];
}

export const ERG_SPORTS = ["SkiErg", "RowErg", "BikeErg"] as const;
const ROW_SPORTS = ["RowErg", "VirtualRow", "Rowing"];

export function sportGroup(a: Pick<ActivityRow, "sport" | "name" | "focus" | "entries" | "garmin_type">): "Run" | "Erg" | "HYROX & strength" | "Other" {
  const c = categorize(a.sport, a.name, a.focus, a.entries, a.garmin_type);
  if (c === "run") return "Run";
  if (c === "erg") return "Erg";
  if (c === "hyrox" || c === "strength") return "HYROX & strength";
  return "Other";
}

const HARD_FOCUS = ["threshold", "intervals", "race"];

export function isHardSession(a: ActivityRow): boolean {
  const z = a.zone_seconds;
  return (
    (z ? z[3] + z[4] >= 600 : false) ||
    (a.load ?? 0) >= 100 ||
    (a.rpe ?? 0) >= 8 ||
    HARD_FOCUS.includes(a.focus ?? "") ||
    // Garmin Training Effect: 4+ aerobic is "highly improving", 2.5+ anaerobic is real top-end work.
    (a.garmin_te_aerobic ?? 0) >= 4 ||
    (a.garmin_te_anaerobic ?? 0) >= 2.5
  );
}

/** Structured hard work: your session type, HR time at threshold+, or a workout-style run name. */
function isQualitySession(a: ActivityRow): boolean {
  if (a.focus) return a.focus === "threshold" || a.focus === "intervals";
  return isRun(a.sport) && (((a.zone_seconds?.[3] ?? 0) + (a.zone_seconds?.[4] ?? 0) >= 600) || /tempo|threshold|interval|reps|\d\s*[x×]\s*\d|fartlek|track/i.test(a.name ?? ""));
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

/** Distances of Strava's best-effort names, metres. */
export const STRAVA_DISTANCES: Record<string, number> = {
  "1K": 1000,
  "1 mile": 1609.34,
  "2 mile": 3218.69,
  "5K": 5000,
  "10K": 10000,
  "15K": 15000,
  "10 mile": 16093.4,
  "20K": 20000,
  "Half-Marathon": 21097.5,
  Marathon: 42195,
};
/** Long enough to say something about threshold/endurance fitness. */
const FITNESS_DISTANCES = ["5K", "10K", "15K", "10 mile", "Half-Marathon"];

export interface StravaBest {
  name: string;
  seconds: number;
  date: string;
  activityId: string;
}

/** Fastest Strava best effort per distance among runs between two dates. */
export function stravaBestsWithin(runs: ActivityRow[], fromDate: string, toDate: string): Record<string, StravaBest> {
  const out: Record<string, StravaBest> = {};
  for (const r of runs) {
    const d = localDate(r.start_time);
    if (d < fromDate || d > toDate || !r.strava_best_efforts || r.trainer) continue;
    for (const [name, sec] of Object.entries(r.strava_best_efforts)) {
      if (!(name in STRAVA_DISTANCES) || !sec) continue;
      if (!out[name] || sec < out[name].seconds) out[name] = { name, seconds: sec, date: d, activityId: r.id };
    }
  }
  return out;
}

function estimate(athlete: AthleteRow, efforts: Record<string, number>, refDate: string, stravaBests: Record<string, StravaBest> = {}): ThresholdEstimate {
  const candidates: { source: string; vdot: number }[] = [];
  const cs = criticalSpeed(efforts);
  if (cs) candidates.push({ source: "Critical speed (3–20 min best efforts)", vdot: round(vdotFromThresholdSpeed(thresholdFromCs(cs.cs)), 1) });
  for (const t of ["1200", "1800", "3600"]) {
    if (efforts[t]) candidates.push({ source: `Best ${Number(t) / 60}-min effort`, vdot: round(vdotFromPerformance(efforts[t], Number(t)), 1) });
  }
  // Strava's best efforts are real performances inside your runs (e.g. a 5K in a parkrun or tempo).
  for (const name of FITNESS_DISTANCES) {
    const b = stravaBests[name];
    if (b) candidates.push({ source: `Best ${name} on Strava (${b.date})`, vdot: round(vdotFromPerformance(STRAVA_DISTANCES[name], b.seconds), 1) });
  }
  // Garmin keeps showing your last measured threshold until it re-measures, so accept up to a year.
  const ltAge = athlete.garmin_lt_date ? Date.parse(refDate) - Date.parse(athlete.garmin_lt_date) : NaN;
  const garminLt = athlete.garmin_lt_speed && (isNaN(ltAge) || (ltAge >= -86400000 && ltAge < 365 * 86400000));
  if (garminLt) candidates.push({ source: `Garmin lactate threshold (${athlete.garmin_lt_date ?? "latest"})`, vdot: round(vdotFromThresholdSpeed(athlete.garmin_lt_speed!), 1) });
  const raceAge = athlete.race_date ? Date.parse(refDate) - Date.parse(athlete.race_date) : NaN;
  if (athlete.race_distance_m && athlete.race_time_s && raceAge >= 0 && raceAge < 120 * 86400000) {
    candidates.push({ source: "Recent race result", vdot: round(vdotFromPerformance(athlete.race_distance_m, athlete.race_time_s), 1) });
  }

  if (athlete.threshold_pace_override) {
    const speed = 1000 / athlete.threshold_pace_override;
    return { vdot: round(vdotFromThresholdSpeed(speed), 1), thresholdSpeed: speed, source: "Manual threshold pace (Settings)", candidates, cs };
  }
  if (!candidates.length) return { vdot: null, thresholdSpeed: null, source: "Not enough data yet", candidates, cs };
  // A race you entered is the most reliable. Otherwise take the strongest evidence: training and
  // illness only ever make you look slower than you are, never faster.
  const race = candidates.find((c) => c.source === "Recent race result");
  const chosen = race ?? candidates.reduce((a, b) => (b.vdot > a.vdot ? b : a));
  const thresholdSpeed = chosen.source.startsWith("Garmin")
    ? athlete.garmin_lt_speed
    : cs && chosen.source.startsWith("Critical")
      ? thresholdFromCs(cs.cs)
      : null;
  return { vdot: chosen.vdot, thresholdSpeed, source: chosen.source, candidates, cs };
}

/** Running VDOT as of a date, from the 120 days of runs before it. */
// Trends (useOverride = false) use only your runs, so they stay comparable over time.
function vdotAsOf(runs: ActivityRow[], athlete: AthleteRow, date: string, useOverride: boolean): number | null {
  const a = useOverride ? athlete : { ...athlete, threshold_pace_override: null, garmin_lt_speed: null };
  return estimate(a, bestEffortsWithin(runs, shift(date, -89), date), date, stravaBestsWithin(runs, shift(date, -119), date)).vdot;
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
  timeOff: TimeOff[];
}

async function loadEverything(): Promise<Everything> {
  await applyGarminLoadsIfNeeded();
  const [athlete, activities, benchmarks, checkins, timeOff] = await Promise.all([
    getAthlete(),
    getActivities(450),
    getBenchmarks(450),
    getCheckins(60),
    getTimeOff(200),
  ]);
  return { athlete, activities, benchmarks, checkins, timeOff };
}

function ergSessions(activities: ActivityRow[], sports: string[], machine: "ski" | "row"): ErgSession[] {
  const whole = activities
    .filter((a) => sports.includes(a.sport) && a.distance_m && a.duration_s)
    .map((a) => {
      const workout = String((a.details as { workout?: string } | null)?.workout ?? a.name ?? "");
      return { date: localDate(a.start_time), distance_m: a.distance_m!, time_s: a.moving_s ?? a.duration_s, intervals: /\d\s*[x×]\s*\d/i.test(workout) };
    });
  // Pieces logged inside other sessions (e.g. a class with a 1 km ski).
  const inside = activities.flatMap((a) => (a.entries?.length ? ergSessionsFromEntries(localDate(a.start_time), a.entries, machine) : []));
  return [...whole, ...inside];
}

/** Benchmarks you logged, plus big-enough station efforts inside sessions. */
function allBenchmarks(e: Everything): Benchmark[] {
  const inside = e.activities.flatMap((a) => (a.entries?.length ? benchmarksFromEntries(localDate(a.start_time), a.entries) : []));
  return [...e.benchmarks, ...inside];
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

export interface HyroxResult {
  id: string;
  date: string;
  name: string;
  total: number;
  hasSplits: boolean;
  fromStrava: boolean;
  division: Division;
}

/**
 * Your HYROX races: ones logged here with splits, plus Strava activities you've confirmed
 * as a race (session type "Race"). Splits-less Strava recordings of a logged race are dropped.
 */
function hyroxResults(e: Everything): HyroxResult[] {
  const main = e.athlete.hyrox_division as Division;
  const out: HyroxResult[] = [];
  for (const a of e.activities) {
    const date = localDate(a.start_time);
    if (a.sport === "HYROX") {
      const sp = a.details as unknown as HyroxSplits | null;
      if (sp?.kind === "race") out.push({ id: a.id, date, name: a.name ?? "HYROX race", total: a.duration_s, hasSplits: true, fromStrava: false, division: sp.division ?? main });
    } else if (a.focus === "race" && !a.excluded) {
      out.push({ id: a.id, date, name: a.name ?? "HYROX", total: a.duration_s, hasSplits: false, fromStrava: a.source === "strava", division: main });
    }
  }
  return out
    .filter((r) => r.hasSplits || !out.some((o) => o.hasSplits && Math.abs(Date.parse(o.date) - Date.parse(r.date)) <= 86400000))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface SimResult {
  id: string;
  date: string;
  name: string;
  total: number;
  kind: "full" | "half";
  fromStrava: boolean;
  /** You marked it yourself (vs picked up from the name). */
  marked: boolean;
  /** Category it was done in: a doubles sim only feeds the doubles prediction. */
  division: Division;
}

/** Your doubles category: the latest one you've raced or logged, else Doubles in your weights. */
function doublesDivision(e: Everything): Division {
  const raced = e.activities.find((a) => a.sport === "HYROX" && isDoubles(((a.details as unknown as HyroxSplits | null)?.division ?? "open_men") as Division));
  const d = (raced?.details as unknown as HyroxSplits | null)?.division;
  if (d) return d;
  return String(e.athlete.hyrox_division).includes("women") ? "doubles_women" : "doubles_men";
}

/**
 * HYROX simulations: sessions named "sim"/"simulation" (e.g. "Hyrox sim" from Strava),
 * plus sims logged here with splits. Full sims feed the prediction (singles only).
 */
function simResults(e: Everything): SimResult[] {
  const main = e.athlete.hyrox_division as Division;
  const doubles = doublesDivision(e);
  // Your choice, else the name ("doubles", "partner"…), else your main (singles) division.
  const divisionOf = (a: ActivityRow): Division =>
    a.sim_division && a.sim_division in DIVISIONS ? (a.sim_division as Division) : DOUBLES_NAME.test(a.name ?? "") ? doubles : main;
  const out: SimResult[] = [];
  for (const a of e.activities) {
    if (a.excluded || a.focus === "race" || a.sim_kind === "none") continue;
    const date = localDate(a.start_time);
    const total = a.sim_time_s || a.duration_s;
    const base = { id: a.id, date, total, fromStrava: a.source === "strava" };
    if (a.sim_kind === "full" || a.sim_kind === "half") {
      out.push({ ...base, name: a.name ?? "Sim", kind: a.sim_kind, marked: true, division: divisionOf(a) });
      continue;
    }
    if (a.sport === "HYROX") {
      const sp = a.details as unknown as HyroxSplits | null;
      if (sp?.kind === "full_sim" || sp?.kind === "half_sim")
        out.push({ ...base, name: a.name ?? "HYROX sim", kind: sp.kind === "full_sim" ? "full" : "half", marked: true, division: sp.division ?? main });
      continue;
    }
    // Elapsed time for a sim: the clock runs through the Roxzone.
    const kind = simKind(a.name, a.duration_s);
    if (kind) out.push({ ...base, name: a.name ?? "Sim", kind, marked: false, division: divisionOf(a) });
  }
  // The same sim logged with splits and recorded on Strava: keep the logged one.
  return out
    .filter((s) => s.marked || !s.fromStrava || !out.some((o) => !o.fromStrava && o.kind === s.kind && Math.abs(Date.parse(o.date) - Date.parse(s.date)) <= 86400000))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Sessions named like a sim that weren't picked up automatically (e.g. a recording with a long warm-up). */
function possibleSims(e: Everything, sims: SimResult[]) {
  return e.activities
    // Ones the name already covers are either counted or a duplicate of a logged sim.
    .filter((a) => !a.excluded && a.sport !== "HYROX" && !a.sim_kind && a.focus !== "race" && SIM_NAME.test(a.name ?? "") && !simKind(a.name, a.duration_s))
    .filter((a) => !sims.some((s) => s.id === a.id))
    .map((a) => ({ id: a.id, date: localDate(a.start_time), name: a.name ?? "Sim", total: a.duration_s }))
    .slice(0, 10);
}

/** Today's predictions by category — used to show the before/after when you mark a sim. */
export async function currentHyroxPredictions(also: Division[] = []): Promise<Record<string, number>> {
  const e = await loadEverything();
  const runs = e.activities.filter((a) => isRun(a.sport));
  const sims = hyroxSessions(e, runs);
  const divisions = new Set<Division>([e.athlete.hyrox_division as Division, doublesDivision(e), ...simResults(e).map((s) => s.division), ...also]);
  return Object.fromEntries([...divisions].map((d) => [d, predictAt(e, runs, sims, today(), true, d).total]));
}

/** Category a session's sim counts for, and your doubles category (for the sim control). */
export async function simDivisions(a: ActivityRow): Promise<{ current: Division; main: Division; doubles: Division }> {
  const e = await loadEverything();
  const main = e.athlete.hyrox_division as Division;
  const doubles = doublesDivision(e);
  const current = a.sim_division && a.sim_division in DIVISIONS ? (a.sim_division as Division) : DOUBLES_NAME.test(a.name ?? "") ? doubles : main;
  return { current, main, doubles };
}

/**
 * Strava activities named like HYROX that might be races (45–150 min) but aren't confirmed
 * either way — shown on the HYROX page with "race / not a race" buttons.
 */
function possibleRaces(e: Everything, results: HyroxResult[]) {
  return e.activities
    .filter((a) => a.sport !== "HYROX" && !a.focus && !a.excluded && /hyrox|doubles|relay/i.test(a.name ?? "") && !simKind(a.name, a.duration_s))
    .filter((a) => {
      const dur = a.moving_s ?? a.duration_s;
      return dur >= 45 * 60 && dur <= 150 * 60;
    })
    .filter((a) => !results.some((r) => Math.abs(Date.parse(r.date) - Date.parse(localDate(a.start_time))) <= 86400000))
    .map((a) => ({ id: a.id, date: localDate(a.start_time), name: a.name ?? "HYROX", total: a.duration_s }))
    .slice(0, 10);
}

function predictAt(e: Everything, runs: ActivityRow[], sims: HyroxSession[], date: string, useOverride: boolean, division?: Division): Prediction {
  const main = e.athlete.hyrox_division as Division;
  const div = division ?? main;
  const vdot = vdotAsOf(runs, e.athlete, date, useOverride);
  // Today's prediction uses Garmin's own 10K prediction when synced; trends use your runs only.
  // The faster of the two: both are evidence of what you can run, neither overstates it much.
  const garmin10k = useOverride && !e.athlete.threshold_pace_override ? e.athlete.garmin_pred_10k : null;
  const own10k = vdot ? predictTime(vdot, 10000) : null;
  const useGarmin = !!garmin10k && (!own10k || garmin10k < own10k);
  const tenK = useGarmin ? garmin10k : own10k;
  // Each category is predicted from its own races; solo training data only applies to singles.
  const doubles = isDoubles(div);
  return predictHyrox({
    division: div,
    asOf: date,
    tenKPace: tenK ? tenK / 10 : null,
    tenKSource: useGarmin ? "Garmin 10K prediction" : "10K pace from your running fitness",
    skiSessions: doubles ? [] : ergSessions(e.activities, ["SkiErg"], "ski"),
    rowSessions: doubles ? [] : ergSessions(e.activities, ROW_SPORTS, "row"),
    benchmarks: doubles ? [] : allBenchmarks(e),
    hyroxSessions: sims.filter((s) => (s.splits.division ?? main) === div),
    raceTotals: hyroxResults(e)
      .filter((r) => !r.hasSplits && r.division === div)
      .map((r) => ({ date: r.date, total: r.total, label: r.fromStrava ? "race on Strava" : "race" })),
    // Each sim only speaks for the category it was done in.
    simTotals: simResults(e)
      .filter((s) => s.kind === "full" && s.division === div)
      .map((s) => ({ date: s.date, total: s.total, label: s.fromStrava ? `sim on Strava ("${s.name}")` : "logged full sim" })),
  });
}

/** Fastest result in a division. */
function bestIn(results: HyroxResult[], division: Division): HyroxResult | null {
  return results.filter((r) => r.division === division).reduce<HyroxResult | null>((a, r) => (!a || r.total < a.total ? r : a), null);
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

/** Run sessions that count as threshold, intervals or long, for "what's missing this week". */
function runKind(a: ActivityRow): "threshold" | "intervals" | "long" | null {
  const isRunish = isRun(a.sport) || entryTags(a.entries).run || a.focus === "threshold" || a.focus === "intervals";
  if (!isRunish) return null;
  // Your session type wins; then the name — threshold words before rep patterns ("Threshold 3×10'").
  if (a.focus === "intervals") return "intervals";
  if (a.focus === "threshold" || /tempo|threshold|cruise|lt\b/i.test(a.name ?? "")) return "threshold";
  if (/interval|reps|\d\s*[x×]\s*\d|track|vo2/i.test(a.name ?? "")) return "intervals";
  if ((a.zone_seconds?.[3] ?? 0) >= 900 && isRun(a.sport)) return "threshold";
  if (a.focus === "long" || (isRun(a.sport) && (a.moving_s ?? a.duration_s) >= 75 * 60)) return "long";
  return null;
}

/** Today: recovery against your baseline, Push / Easy / Rest, and this week's training call. */
export async function todayData() {
  const [e, strava, racesRes] = await Promise.all([
    loadEverything(),
    db().from("strava_auth").select("athlete_name, last_sync_at").eq("id", 1).maybeSingle(),
    db().from("races").select("name, date").gte("date", today()).order("date").limit(1),
  ]);
  // Next race from the race list (Body tab); fine if the table doesn't exist yet.
  const nextRace = racesRes.error ? null : (racesRes.data?.[0] as { name: string; date: string } | undefined) ?? null;
  const { athlete, activities, checkins } = e;
  const counted = activities.filter((a) => !a.excluded);
  const runs = activities.filter((a) => isRun(a.sport));
  const t = today();

  const days: RecoveryDay[] = checkins.map((c) => ({
    date: c.date,
    hrv: c.hrv_ms,
    rhr: c.resting_hr,
    sleep: c.sleep_score,
    sleepHours: c.sleep_hours,
    bodyBattery: c.body_battery,
    readiness: c.training_readiness,
  }));
  const metrics = recoveryStatus(days, t);

  const series = pmc(dailyLoads(activities), daysAgo(199), t);
  const ratio = acwr(series);
  const byDay = (d: string) => counted.filter((a) => localDate(a.start_time) === d);
  const hardOn = (d: string) => byDay(d).some(isHardSession);
  const off = timeOffStatus(e.timeOff, t);

  const since7 = daysAgo(6);
  const kinds = counted.filter((a) => localDate(a.start_time) >= since7).map(runKind);
  const vdot = vdotAsOf(runs, athlete, t, true);
  const paceZones = vdot ? trainingPaces(vdot) : null;
  const mid = (name: string) => {
    const z = paceZones?.find((x) => x.name === name);
    return z ? formatPace((z.range[0] + z.range[1]) / 2) : "";
  };

  const call = todayCall({
    metrics,
    hasCheckin: days.some((d) => d.date === t),
    acwr: ratio,
    hardYesterday: hardOn(daysAgo(1)),
    hardInLast3Days: [1, 2, 3].filter((n) => hardOn(daysAgo(n))).length,
    trainedToday: byDay(t).some((a) => (a.load ?? 0) >= 20),
    illNow: off.now?.reason === "ill" || off.now?.reason === "injury",
    daysSinceTimeOff: off.back?.days ?? null,
    last7: { threshold: kinds.includes("threshold"), intervals: kinds.includes("intervals"), long: kinds.includes("long") },
    paces: paceZones ? { easy: mid("Easy"), threshold: mid("Threshold"), interval: mid("Interval") } : null,
    easyHrMax: hrZoneBounds(athlete.threshold_hr)[1].max,
    race: nextRace ? { name: nextRace.name, daysTo: Math.round((Date.parse(nextRace.date) - Date.parse(t)) / 86400000) } : null,
  });

  // Weekly call (add / hold / reduce …), aimed at running unless HYROX predictions are switched on.
  const zones = [0, 0, 0, 0, 0];
  for (const a of counted) if (a.zone_seconds && localDate(a.start_time) >= daysAgo(27)) a.zone_seconds.forEach((s, i) => (zones[i] += s));
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const hardShare = zoneTotal > 0 ? (zones[2] + zones[3] + zones[4]) / zoneTotal : null;
  // The sooner of the Settings goal race and the next race on your list.
  const candidates = [
    athlete.goal_date && athlete.goal_date >= t ? { name: athlete.goal_name ?? "Goal race", date: athlete.goal_date } : null,
    nextRace,
  ].filter((g): g is { name: string; date: string } => !!g);
  const soonest = candidates.sort((a, b) => a.date.localeCompare(b.date))[0];
  const goal = soonest ? { ...soonest, daysTo: Math.round((Date.parse(soonest.date) - Date.parse(t)) / 86400000) } : null;
  const sessions: SessionSummary[] = counted
    .filter((a) => localDate(a.start_time) >= daysAgo(34))
    .map((a) => ({
      date: localDate(a.start_time),
      category: categorize(a.sport, a.name, a.focus, a.entries, a.garmin_type),
      load: a.load ?? 0,
      durationS: a.moving_s ?? a.duration_s,
      hard: isHardSession(a),
      quality: isQualitySession(a),
      tags: entryTags(a.entries),
    }));
  const plan = weeklyPlan({
    today: t,
    pmc: series,
    acwr: ratio,
    readinessToday: null,
    readinessRecent: [],
    hardShare,
    sessions,
    daysToGoal: goal?.daysTo ?? null,
    thresholdPace: mid("Threshold") || null,
    timeOff: e.timeOff,
    goal: athlete.show_predictions ? "hyrox" : "running",
    weakStations: [],
  });
  // Recovery feeds the weekly call too: a run of poor recovery days means don't add.
  const lowDays = [0, 1, 2].filter((n) => {
    const m = recoveryStatus(days, daysAgo(n));
    return m.filter((x) => x.status === "low").length >= 2;
  }).length;
  if (plan.verdict === "add" && (lowDays >= 2 || call.call === "rest")) {
    plan.verdict = "maintain";
    plan.headline = "Hold — recovery is lagging";
    plan.reasons.unshift("Load says you could add, but your recovery numbers have been low — hold until they bounce back.");
    plan.suggestions.splice(0, plan.suggestions.length, { action: "keep", session: "Keep your planned sessions, no extras", why: "Adding load while HRV/resting HR are off usually backfires." });
  }

  const lastGarmin = athlete.garmin_synced_at;
  return {
    athlete,
    stravaConnected: !!strava.data,
    lastSync: strava.data?.last_sync_at ?? null,
    lastGarmin,
    hasActivities: activities.length > 0,
    hasCheckin: days.some((d) => d.date === t),
    metrics,
    call,
    plan,
    goal,
    easyShare: hardShare === null ? null : Math.round((1 - hardShare) * 100),
  };
}

// ---------------------------------------------------------------------------
// HYROX page
// ---------------------------------------------------------------------------

export async function hyroxData(divisionParam?: string) {
  const e = await loadEverything();
  const runs = e.activities.filter((a) => isRun(a.sport));
  const sims = hyroxSessions(e, runs);
  const results = hyroxResults(e);
  const main = e.athlete.hyrox_division as Division;

  // A prediction for every category you've raced, plus your main division.
  const raced = [...new Set<Division>([main, ...results.map((r) => r.division), ...sims.map((s) => s.splits.division ?? main), ...simResults(e).map((s) => s.division)])];
  const division = raced.includes(divisionParam as Division) ? (divisionParam as Division) : main;
  const categories = raced.map((d) => ({ division: d, label: DIVISIONS[d], prediction: predictAt(e, runs, sims, today(), true, d).total, best: bestIn(results, d) }));

  const prediction = predictAt(e, runs, sims, today(), true, division);
  const trend = [];
  for (let i = 12; i >= 0; i--) {
    const d = daysAgo(i * 14);
    const p = predictAt(e, runs, sims, d, false, division);
    trend.push({ date: d.slice(5), total: Math.round(p.total), confidence: p.confidence });
  }
  const sessions = e.activities.filter((a) => a.sport === "HYROX");
  return {
    sims: simResults(e).slice(0, 12).map((s) => ({ ...s, divisionLabel: DIVISIONS[s.division] })),
    possibleSims: possibleSims(e, simResults(e)),
    division,
    categories,
    results,
    possibleRaces: possibleRaces(e, results),
    pb: bestIn(results, division),
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
  const ski = ergSessions(e.activities, ["SkiErg"], "ski");
  const row = ergSessions(e.activities, ROW_SPORTS, "row");

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
    const list = allBenchmarks(e)
      .filter((b) => b.station === st.key)
      .map((b) => ({ date: b.date, time: Math.round(benchmarkToRace(b, division)) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { key: st.key, name: st.name, history: list, first: list[0] ?? null, latest: list[list.length - 1] ?? null };
  }).filter((s) => s.history.length > 0);

  // Overall verdict from the key metrics' 6-week change. A recent illness/injury/holiday drops
  // training volume (CTL) and pushes easy-run HR up, so those don't count against you then.
  const recentOff = e.timeOff.filter((t) => t.end >= daysAgo(42) && t.start <= today());
  const volumeKeys = recentOff.length ? [] : ["ctl", "ef"];
  const changes = metrics.filter((m) => ["hyrox", "threshold", "ski", "row", ...volumeKeys].includes(m.key) && m.change6w !== null);
  const better = changes.filter((m) => m.change6w! > 1).length;
  const worse = changes.filter((m) => m.change6w! < -1).length;
  const offNote = recentOff.length
    ? ` Time off ${recentOff.map((t) => `${t.start.slice(5)}–${t.end.slice(5)}`).join(", ")} is accounted for: training volume and easy-run heart rate aren't counted.`
    : "";
  const verdict =
    changes.length === 0
      ? { label: "Not enough data yet", tone: "muted" as const, text: "Sync a few weeks of training and log some SkiErg/Row sessions and station benchmarks." }
      : better > worse
        ? { label: "Yes — you're getting fitter", tone: "good" as const, text: `${better} of ${changes.length} key markers improved over the last 6 weeks.${offNote}` }
        : worse > better
          ? recentOff.length
            ? { label: "Dip after time off", tone: "warn" as const, text: `${worse} of ${changes.length} markers are lower than 6 weeks ago, which is normal straight after a break and usually recovers within 1–2 weeks.${offNote}` }
            : { label: "Fitness is slipping", tone: "bad" as const, text: `${worse} of ${changes.length} key markers got worse over the last 6 weeks. Check consistency and recovery.` }
          : { label: "Holding steady", tone: "warn" as const, text: `Your markers are broadly flat over the last 6 weeks.${offNote || " To progress, add load gradually (see Today)."}` };

  return { metrics, stations, verdict, timeOff: recentOff };
}

// ---------------------------------------------------------------------------
// Running page
// ---------------------------------------------------------------------------

export async function runningData() {
  const [athlete, activities] = await Promise.all([getAthlete(), getActivities(400)]);
  const runs = activities.filter((a) => isRun(a.sport));

  const efforts = bestEffortsWithin(runs, daysAgo(89), today());
  const est = estimate(athlete, efforts, today(), stravaBestsWithin(runs, daysAgo(119), today()));

  // Your actual times, from Strava's best efforts: best of the imported year, and of the last 90 days.
  const yearBests = stravaBestsWithin(runs, "0000-01-01", today());
  const recentBests = stravaBestsWithin(runs, daysAgo(89), today());
  const STRAVA_NAME: Record<string, string> = { "5K": "5K", "10K": "10K", "Half marathon": "Half-Marathon", Marathon: "Marathon" };
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
    predictions: RACES.map((r) => ({
      ...r,
      time: est.vdot ? predictTime(est.vdot, r.m) : null,
      best: yearBests[STRAVA_NAME[r.name]] ?? null,
      recent: recentBests[STRAVA_NAME[r.name]] ?? null,
    })),
    shortBests: ["1K", "1 mile"].map((n) => ({ name: n, best: yearBests[n] ?? null, recent: recentBests[n] ?? null })).filter((x) => x.best),
    hasStravaBests: Object.keys(yearBests).length > 0,
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

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarSession {
  id: string;
  name: string;
  sport: string;
  category: ReturnType<typeof categorize>;
  focus: string | null;
  durationS: number;
  load: number;
  distanceM: number | null;
  avgHr: number | null;
  summary: string;
  hasPhoto: boolean;
  hasDetails: boolean;
  excluded: boolean;
  hard: boolean;
  /** An earlier session that looks like the same class, offered as "Same as …?". */
  suggestion: { id: string; date: string; summary: string } | null;
  needsDetails: boolean;
}

const NO_DETAILS_NEEDED = ["SkiErg", "RowErg", "BikeErg", "HYROX"];

export function needsDetails(a: Pick<ActivityRow, "entries" | "sport" | "excluded" | "garmin_type">): boolean {
  return !a.entries?.length && !a.excluded && !isRun(a.sport) && !NO_DETAILS_NEEDED.includes(a.sport) && categorize(a.sport, null, null, null, a.garmin_type) !== "run";
}

function toCalendarSession(a: ActivityRow, templates: Template[]): CalendarSession {
  const tpl = needsDetails(a) ? bestTemplate(sessionKey(a), templates) : null;
  return {
    id: a.id,
    name: a.name ?? a.sport,
    sport: a.sport,
    category: categorize(a.sport, a.name, a.focus, a.entries, a.garmin_type),
    focus: a.focus,
    durationS: a.moving_s ?? a.duration_s,
    load: Math.round(a.load ?? 0),
    distanceM: a.distance_m,
    avgHr: a.avg_hr,
    summary: summarize(a.entries),
    hasPhoto: !!a.photo_path,
    hasDetails: !!a.entries?.length,
    excluded: a.excluded,
    hard: isHardSession(a),
    suggestion: tpl ? { id: tpl.id, date: tpl.date, summary: summarize(tpl.entries, 2) } : null,
    needsDetails: needsDetails(a),
  };
}

/** Distance-type volumes for a set of sessions: Strava/erg distances plus logged details. */
function weekVolumes(activities: ActivityRow[]): Volumes {
  const v = emptyVolumes();
  for (const a of activities) {
    if (a.excluded) continue;
    if (isRun(a.sport) && a.distance_m) v.runKm += a.distance_m / 1000;
    if (a.sport === "SkiErg" && a.distance_m) v.skiM += a.distance_m;
    if (ROW_SPORTS.includes(a.sport) && a.distance_m) v.rowM += a.distance_m;
    if (a.sport === "BikeErg" && a.distance_m) v.bikeKm += a.distance_m / 1000;
    if (a.sport === "HYROX" && a.details) {
      const sp = a.details as unknown as HyroxSplits;
      v.runKm += (sp.runs ?? []).filter((r) => r).length;
      const st = sp.stations ?? {};
      if (st.ski) v.skiM += 1000;
      if (st.row) v.rowM += 1000;
      v.sledM += (st.sled_push ? 50 : 0) + (st.sled_pull ? 50 : 0);
      if (st.wall_balls) v.wallBalls += 100;
      if (st.lunges) v.lungesM += 100;
      if (st.bbj) v.bbjM += 80;
      if (st.farmers) v.carryM += 200;
    }
    if (a.entries?.length) addEntryVolumes(v, a.entries);
  }
  return v;
}

/** One week (Monday start) plus a month overview around it. */
export async function calendarData(weekParam?: string) {
  await applyGarminLoadsIfNeeded();
  const ref = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today();
  const monday = weekStart(ref);
  const sunday = shift(monday, 6);

  // Month overview: the month that contains most of this week (its Thursday).
  const thursday = shift(monday, 3);
  const monthStart = thursday.slice(0, 8) + "01";
  const gridStart = weekStart(monthStart);
  const nextMonth = new Date(monthStart + "T00:00:00Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = shift(nextMonth.toISOString().slice(0, 10), -1);
  const gridEnd = shift(weekStart(monthEnd), 6);

  const from = gridStart < monday ? gridStart : monday;
  const to = gridEnd > sunday ? gridEnd : sunday;
  const [{ data, error }, checkins, templates, timeOff] = await Promise.all([
    db()
      .from("activities")
      .select("*")
      .gte("start_time", new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString())
      .lte("start_time", new Date(Date.parse(to + "T00:00:00Z") + 2 * 86400000).toISOString())
      .order("start_time"),
    db().from("checkins").select("*").gte("date", monday).lte("date", sunday),
    getTemplates(),
    getTimeOff(400),
  ]);
  if (error) throw error;
  const acts = (data as ActivityRow[]).map((a) => ({ a, date: localDate(a.start_time) })).filter((x) => x.date >= from && x.date <= to);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shift(monday, i);
    const c = ((checkins.data ?? []) as CheckinRow[]).find((x) => x.date === date) ?? null;
    return {
      date,
      sessions: acts.filter((x) => x.date === date).map((x) => toCalendarSession(x.a, templates)),
      checkin: c ? { hrv: c.hrv_ms, sleep: c.sleep_score, bodyBattery: c.body_battery } : null,
      off: timeOff.find((t) => t.start <= date && t.end >= date) ?? null,
    };
  });

  const weekActs = acts.filter((x) => x.date >= monday && x.date <= sunday).map((x) => x.a);
  const counted = weekActs.filter((a) => !a.excluded);
  const byCategory: Record<string, number> = {};
  for (const a of counted) {
    const c = categorize(a.sport, a.name, a.focus, a.entries, a.garmin_type);
    byCategory[c] = (byCategory[c] ?? 0) + (a.moving_s ?? a.duration_s);
  }

  const month: { date: string; inMonth: boolean; categories: string[]; load: number; off: boolean }[][] = [];
  for (let d = gridStart; d <= gridEnd; d = shift(d, 7)) {
    month.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = shift(d, i);
        const list = acts.filter((x) => x.date === date && !x.a.excluded);
        return {
          date,
          inMonth: date >= monthStart && date <= monthEnd,
          categories: list.map((x) => categorize(x.a.sport, x.a.name, x.a.focus, x.a.entries, x.a.garmin_type)),
          load: Math.round(list.reduce((s, x) => s + (x.a.load ?? 0), 0)),
          off: timeOff.some((t) => t.start <= date && t.end >= date),
        };
      }),
    );
  }

  return {
    monday,
    sunday,
    today: today(),
    prevWeek: shift(monday, -7),
    nextWeek: shift(monday, 7),
    monthLabel: new Date(monthStart + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    prevMonth: weekStart(shift(monthStart, -1).slice(0, 8) + "01"),
    nextMonth: weekStart(nextMonth.toISOString().slice(0, 10)),
    days,
    month,
    summary: {
      load: Math.round(counted.reduce((s, a) => s + (a.load ?? 0), 0)),
      sessions: counted.length,
      hours: counted.reduce((s, a) => s + (a.moving_s ?? a.duration_s), 0) / 3600,
      hard: counted.filter(isHardSession).length,
      needsDetails: counted.filter(needsDetails).length,
      byCategory,
      volumes: weekVolumes(weekActs),
    },
  };
}

export async function getActivity(id: string): Promise<ActivityRow | null> {
  const { data } = await db().from("activities").select("*").eq("id", id).maybeSingle();
  return (data as ActivityRow) ?? null;
}

/** Templates for the session editor, with the best "same as last week" match first. */
export async function templatesFor(a: ActivityRow | null): Promise<{ suggestedId: string | null; templates: (Template & { label: string })[] }> {
  const templates = await getTemplates();
  const suggested = a ? bestTemplate(sessionKey(a), templates) : null;
  const list = templates
    .filter((t) => !a || t.id !== a.id)
    .slice(0, 40)
    .map((t) => ({
      ...t,
      label: `${new Date(t.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${t.name ?? t.sport} · ${summarize(t.entries, 2)}`,
    }));
  return { suggestedId: suggested?.id ?? null, templates: list };
}

// ---------------------------------------------------------------------------
// Running progress (what you actually ran — no predictions)
// ---------------------------------------------------------------------------

/** Pace of the hard part of a quality session: logged reps if any, else Strava's best 20/6-min stretch. */
function qualityPace(a: ActivityRow, kind: "threshold" | "intervals"): number | null {
  const reps = (a.entries ?? []).filter((x) => x.exercise === "run" || x.exercise === "treadmill");
  const paces = reps.map(entryPace).filter((p): p is number => p !== null);
  if (paces.length) return paces.reduce((s, p) => s + p, 0) / paces.length;
  const key = kind === "threshold" ? "1200" : "360";
  const metres = a.best_efforts?.[key];
  return metres ? Number(key) / (metres / 1000) : null;
}

export async function runningProgress() {
  const [athlete, activities] = await Promise.all([getAthlete(), getActivities(400)]);
  const runs = activities.filter((a) => isRun(a.sport) && !a.excluded);
  const t = today();

  // Easy pace at a fixed heart rate (~Z2), one point per easy run.
  const refHr = Math.round(athlete.threshold_hr * 0.85);
  const easy = runs.filter(
    (r) =>
      r.avg_hr &&
      r.distance_m &&
      r.distance_m >= 3000 &&
      (r.moving_s ?? r.duration_s) >= 20 * 60 &&
      r.avg_hr < athlete.threshold_hr * 0.9 &&
      r.avg_hr > athlete.resting_hr + 20,
  );
  const easyPoints = easy.map((r) => ({ date: localDate(r.start_time), value: paceAtHr(r.distance_m!, r.moving_s ?? r.duration_s, r.avg_hr!, refHr) }));
  const weekly = weeklyMedian(easyPoints.filter((p) => p.date >= daysAgo(12 * 7)));
  const easyChange = windowChange(easyPoints, t, 28);

  // Weekly km: this week so far vs the average of the previous 4 full weeks.
  const thisWeek = weekStart(t);
  const kmBetween = (from: string, to: string) =>
    runs.filter((r) => localDate(r.start_time) >= from && localDate(r.start_time) <= to).reduce((s, r) => s + (r.distance_m ?? 0), 0) / 1000;
  const weekKm = kmBetween(thisWeek, t);
  const avgKm = kmBetween(shift(thisWeek, -28), shift(thisWeek, -1)) / 4;

  // Best efforts: last 90 days vs the 90 before.
  const recent = stravaBestsWithin(runs, daysAgo(89), t);
  const before = stravaBestsWithin(runs, daysAgo(179), daysAgo(90));
  const bests = ["1K", "1 mile", "5K", "10K", "Half-Marathon"]
    .filter((n) => recent[n] || before[n])
    .map((n) => ({ name: n === "Half-Marathon" ? "Half" : n, recent: recent[n] ?? null, before: before[n] ?? null }));

  // Quality sessions, newest first.
  const quality = activities
    .filter((a) => !a.excluded && localDate(a.start_time) >= daysAgo(60))
    .map((a) => ({ a, kind: runKind(a) }))
    .filter((x): x is { a: ActivityRow; kind: "threshold" | "intervals" } => x.kind === "threshold" || x.kind === "intervals")
    .slice(0, 6)
    .map(({ a, kind }) => ({ id: a.id, date: localDate(a.start_time), name: a.name ?? kind, kind, pace: qualityPace(a, kind) }));

  const vdot = vdotAsOf(runs, athlete, t, true);
  const paces = vdot ? trainingPaces(vdot).filter((z) => ["Easy", "Threshold", "Interval"].includes(z.name)) : [];

  return {
    athlete,
    hasRuns: runs.length > 0,
    refHr,
    weekly: weekly.map((w) => ({ date: w.date, value: Math.round(w.value) })),
    easyNow: weekly.length ? weekly[weekly.length - 1].value : null,
    easyChange,
    weekKm,
    avgKm,
    bests,
    hasStravaBests: Object.keys(stravaBestsWithin(runs, "0000-01-01", t)).length > 0,
    quality,
    paces,
  };
}
