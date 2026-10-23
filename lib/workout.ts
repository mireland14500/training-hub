// What was done inside a session (e.g. a gym class): exercises, paces, weights.
// Pure functions only — used by the session editor, the calendar and the analysis.

import { STATION_BY_KEY, type Benchmark, type ErgSession, type StationKey } from "./hyrox";

export type ExerciseKey =
  | "run"
  | "treadmill"
  | "ski"
  | "row"
  | "bike"
  | "sled_push"
  | "sled_pull"
  | "wall_balls"
  | "lunges"
  | "bbj"
  | "farmers"
  | "other";

export interface Exercise {
  key: ExerciseKey;
  name: string;
  /** cardio = distance/time/pace; station = HYROX-style move; other = free text strength. */
  kind: "cardio" | "station" | "other";
  /** Unit pace is shown in for cardio. */
  paceUnit?: "km" | "500m";
  /** HYROX station this counts towards, if any. */
  station?: StationKey;
  /** Whether "amount" is metres or reps (stations). */
  amountUnit?: "m" | "reps";
}

export const EXERCISES: Exercise[] = [
  { key: "run", name: "Run", kind: "cardio", paceUnit: "km" },
  { key: "treadmill", name: "Treadmill", kind: "cardio", paceUnit: "km" },
  { key: "ski", name: "SkiErg", kind: "cardio", paceUnit: "500m", station: "ski" },
  { key: "row", name: "Row", kind: "cardio", paceUnit: "500m", station: "row" },
  { key: "bike", name: "Bike / BikeErg", kind: "cardio", paceUnit: "km" },
  { key: "sled_push", name: "Sled push", kind: "station", station: "sled_push", amountUnit: "m" },
  { key: "sled_pull", name: "Sled pull", kind: "station", station: "sled_pull", amountUnit: "m" },
  { key: "wall_balls", name: "Wall balls", kind: "station", station: "wall_balls", amountUnit: "reps" },
  { key: "lunges", name: "Sandbag lunges", kind: "station", station: "lunges", amountUnit: "m" },
  { key: "bbj", name: "Burpee broad jumps", kind: "station", station: "bbj", amountUnit: "m" },
  { key: "farmers", name: "Farmers carry", kind: "station", station: "farmers", amountUnit: "m" },
  { key: "other", name: "Other exercise", kind: "other" },
];
export const EXERCISE_BY_KEY = Object.fromEntries(EXERCISES.map((e) => [e.key, e])) as Record<ExerciseKey, Exercise>;

/** One line of a workout: e.g. 4 × 500 m SkiErg in 1:50 each. Values are per set. */
export interface Entry {
  exercise: ExerciseKey;
  /** Free-text name, used for "other" (e.g. "KB swings") or to label a block. */
  name?: string | null;
  sets?: number | null;
  distance_m?: number | null;
  reps?: number | null;
  time_s?: number | null;
  speed_kmh?: number | null; // treadmill
  incline_pct?: number | null; // treadmill
  weight_kg?: number | null;
  notes?: string | null;
}

export const FOCUS = [
  { key: "easy", label: "Easy" },
  { key: "long", label: "Long" },
  { key: "threshold", label: "Threshold" },
  { key: "intervals", label: "Intervals" },
  { key: "hyrox", label: "HYROX" },
  { key: "strength", label: "Strength" },
  { key: "recovery", label: "Recovery" },
  { key: "race", label: "Race" },
] as const;
export type Focus = (typeof FOCUS)[number]["key"];

const sets = (e: Entry) => (e.sets && e.sets > 0 ? e.sets : 1);

/** Seconds per km (run/treadmill/bike) or per 500 m (ski/row) for one set, if derivable. */
export function entryPace(e: Entry): number | null {
  const ex = EXERCISE_BY_KEY[e.exercise];
  if (!ex?.paceUnit) return null;
  const per = ex.paceUnit === "km" ? 1000 : 500;
  if (e.time_s && e.distance_m) return (e.time_s / e.distance_m) * per;
  if (e.speed_kmh) return (3600 / e.speed_kmh) * (per / 1000);
  return null;
}

/** Distance of one set, filling in from speed × time on a treadmill. */
export function setDistance(e: Entry): number | null {
  if (e.distance_m) return e.distance_m;
  if (e.speed_kmh && e.time_s) return (e.speed_kmh / 3.6) * e.time_s;
  return null;
}

export interface Volumes {
  runKm: number; // outdoor + treadmill (from session details; Strava runs are added separately)
  skiM: number;
  rowM: number;
  bikeKm: number;
  sledM: number; // push + pull
  wallBalls: number;
  lungesM: number;
  bbjM: number;
  carryM: number;
}

export function emptyVolumes(): Volumes {
  return { runKm: 0, skiM: 0, rowM: 0, bikeKm: 0, sledM: 0, wallBalls: 0, lungesM: 0, bbjM: 0, carryM: 0 };
}

export function addEntryVolumes(v: Volumes, entries: Entry[]): Volumes {
  for (const e of entries) {
    const n = sets(e);
    const d = (setDistance(e) ?? 0) * n;
    switch (e.exercise) {
      case "run":
      case "treadmill":
        v.runKm += d / 1000;
        break;
      case "ski":
        v.skiM += d;
        break;
      case "row":
        v.rowM += d;
        break;
      case "bike":
        v.bikeKm += d / 1000;
        break;
      case "sled_push":
      case "sled_pull":
        v.sledM += d;
        break;
      case "wall_balls":
        v.wallBalls += (e.reps ?? 0) * n;
        break;
      case "lunges":
        v.lungesM += d;
        break;
      case "bbj":
        v.bbjM += d;
        break;
      case "farmers":
        v.carryM += d;
        break;
    }
  }
  return v;
}

/** Short human summary, e.g. "4×500 m SkiErg · 4×1 km Treadmill @ 15 km/h". */
export function summarize(entries: Entry[] | null | undefined, max = 3): string {
  if (!entries?.length) return "";
  const parts = entries.slice(0, max).map((e) => {
    const ex = EXERCISE_BY_KEY[e.exercise];
    const n = sets(e) > 1 ? `${sets(e)}×` : "";
    const amount = e.distance_m ? (e.distance_m >= 1000 ? `${+(e.distance_m / 1000).toFixed(2)} km` : `${e.distance_m} m`) : e.reps ? `${e.reps}` : e.time_s ? fmt(e.time_s) : "";
    const label = e.exercise === "other" ? e.name || "Other" : ex?.name ?? e.exercise;
    const extra = e.speed_kmh ? ` @ ${e.speed_kmh} km/h` : e.weight_kg ? ` @ ${e.weight_kg} kg` : "";
    return `${n}${amount} ${label}${extra}`.trim();
  });
  return parts.join(" · ") + (entries.length > max ? ` +${entries.length - max}` : "");
}

/** Session contents as tags for the weekly session mix. */
export function entryTags(entries: Entry[] | null | undefined) {
  const has = (keys: ExerciseKey[]) => !!entries?.some((e) => keys.includes(e.exercise));
  return {
    run: has(["run", "treadmill"]),
    erg: has(["ski", "row", "bike"]),
    station: has(["sled_push", "sled_pull", "wall_balls", "lunges", "bbj", "farmers"]),
  };
}

// ---------------------------------------------------------------------------
// Feeding the HYROX prediction
// ---------------------------------------------------------------------------

/** Ski/row pieces as erg sessions (multi-set pieces count as intervals, which the 1 km estimate skips). */
export function ergSessionsFromEntries(date: string, entries: Entry[], machine: "ski" | "row"): ErgSession[] {
  return entries
    .filter((e) => e.exercise === machine && e.distance_m && e.time_s)
    .map((e) => ({ date, distance_m: e.distance_m!, time_s: e.time_s!, intervals: sets(e) > 1 }));
}

/**
 * Station efforts big enough to say something about race pace (at least half the race
 * distance/reps in one go) become benchmarks. Efforts in a session that also had running
 * count as "after running", so no extra race fatigue is added.
 */
export function benchmarksFromEntries(date: string, entries: Entry[]): Benchmark[] {
  const afterRunning = entryTags(entries).run;
  const out: Benchmark[] = [];
  for (const e of entries) {
    const ex = EXERCISE_BY_KEY[e.exercise];
    if (ex?.kind !== "station" || !ex.station || !e.time_s) continue;
    const st = STATION_BY_KEY[ex.station];
    const amount = ex.amountUnit === "reps" ? e.reps : e.distance_m;
    if (!amount || amount < st.amount / 2) continue;
    out.push({ date, station: ex.station, time_s: e.time_s, amount, load_kg: e.weight_kg ?? null, fresh: !afterRunning });
  }
  return out;
}

/** Cleans entries posted from the editor: known exercise, numbers or null. */
export function sanitizeEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  const n = (v: unknown) => {
    const x = typeof v === "string" ? Number(v) : v;
    return typeof x === "number" && isFinite(x) && x > 0 ? x : null;
  };
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && (r as { exercise?: string }).exercise! in EXERCISE_BY_KEY)
    .map((r) => ({
      exercise: r.exercise as ExerciseKey,
      name: t(r.name),
      sets: n(r.sets),
      distance_m: n(r.distance_m),
      reps: n(r.reps),
      time_s: n(r.time_s),
      speed_kmh: n(r.speed_kmh),
      incline_pct: typeof r.incline_pct === "number" || typeof r.incline_pct === "string" ? (Number(r.incline_pct) >= 0 ? Number(r.incline_pct) || null : null) : null,
      weight_kg: n(r.weight_kg),
      notes: t(r.notes),
    }))
    .slice(0, 50);
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
