// HYROX race model: 8 × (1 km run + station) + Roxzone transitions.
// Pure functions only — data loading lives in lib/data.ts.

export type Division = "open_men" | "open_women" | "pro_men" | "pro_women";
export type StationKey = "ski" | "sled_push" | "sled_pull" | "bbj" | "row" | "farmers" | "lunges" | "wall_balls";

export const DIVISIONS: Record<Division, string> = {
  open_men: "Open Men",
  open_women: "Open Women",
  pro_men: "Pro Men",
  pro_women: "Pro Women",
};

export interface Station {
  key: StationKey;
  name: string;
  /** Race distance in metres, or reps for wall balls. */
  amount: number;
  unit: "m" | "reps";
  /** Race load per division, kg (sled = total incl. sled, farmers = per hand). */
  load: Record<Division, number | null>;
  /** How time scales with load: time ∝ (raceLoad / benchmarkLoad)^loadExp. */
  loadExp: number;
}

// Race order.
export const STATIONS: Station[] = [
  { key: "ski", name: "SkiErg 1000 m", amount: 1000, unit: "m", load: { open_men: null, open_women: null, pro_men: null, pro_women: null }, loadExp: 0 },
  { key: "sled_push", name: "Sled Push 50 m", amount: 50, unit: "m", load: { open_men: 152, open_women: 102, pro_men: 202, pro_women: 152 }, loadExp: 1 },
  { key: "sled_pull", name: "Sled Pull 50 m", amount: 50, unit: "m", load: { open_men: 103, open_women: 78, pro_men: 153, pro_women: 103 }, loadExp: 1 },
  { key: "bbj", name: "Burpee Broad Jumps 80 m", amount: 80, unit: "m", load: { open_men: null, open_women: null, pro_men: null, pro_women: null }, loadExp: 0 },
  { key: "row", name: "Row 1000 m", amount: 1000, unit: "m", load: { open_men: null, open_women: null, pro_men: null, pro_women: null }, loadExp: 0 },
  { key: "farmers", name: "Farmers Carry 200 m", amount: 200, unit: "m", load: { open_men: 24, open_women: 16, pro_men: 32, pro_women: 24 }, loadExp: 0.5 },
  { key: "lunges", name: "Sandbag Lunges 100 m", amount: 100, unit: "m", load: { open_men: 20, open_women: 10, pro_men: 30, pro_women: 20 }, loadExp: 0.5 },
  { key: "wall_balls", name: "Wall Balls 100 reps", amount: 100, unit: "reps", load: { open_men: 6, open_women: 4, pro_men: 9, pro_women: 6 }, loadExp: 0.5 },
];
export const STATION_BY_KEY = Object.fromEntries(STATIONS.map((s) => [s.key, s])) as Record<StationKey, Station>;

export interface Reference {
  run: number; // seconds per 1 km run segment
  roxzone: number; // total transition time
  stations: Record<StationKey, number>;
}

/**
 * Approximate reference splits (seconds). "average" ≈ a typical mid-pack finisher,
 * "fast" ≈ top ~15% of the division. Rough guides compiled from public race results —
 * your own benchmarks always replace these.
 */
export const REFERENCE: Record<Division, { average: Reference; fast: Reference }> = {
  open_men: {
    average: { run: 330, roxzone: 450, stations: { ski: 285, sled_push: 210, sled_pull: 300, bbj: 300, row: 290, farmers: 120, lunges: 285, wall_balls: 360 } },
    fast: { run: 255, roxzone: 300, stations: { ski: 245, sled_push: 150, sled_pull: 210, bbj: 210, row: 250, farmers: 90, lunges: 210, wall_balls: 255 } },
  },
  open_women: {
    average: { run: 360, roxzone: 480, stations: { ski: 315, sled_push: 240, sled_pull: 330, bbj: 345, row: 315, farmers: 135, lunges: 315, wall_balls: 390 } },
    fast: { run: 290, roxzone: 330, stations: { ski: 270, sled_push: 165, sled_pull: 225, bbj: 240, row: 275, farmers: 100, lunges: 225, wall_balls: 270 } },
  },
  pro_men: {
    average: { run: 300, roxzone: 420, stations: { ski: 270, sled_push: 240, sled_pull: 330, bbj: 280, row: 275, farmers: 120, lunges: 300, wall_balls: 390 } },
    fast: { run: 235, roxzone: 270, stations: { ski: 235, sled_push: 170, sled_pull: 225, bbj: 195, row: 240, farmers: 85, lunges: 220, wall_balls: 270 } },
  },
  pro_women: {
    average: { run: 330, roxzone: 450, stations: { ski: 300, sled_push: 270, sled_pull: 360, bbj: 320, row: 305, farmers: 130, lunges: 330, wall_balls: 420 } },
    fast: { run: 265, roxzone: 300, stations: { ski: 260, sled_push: 190, sled_pull: 250, bbj: 225, row: 265, farmers: 95, lunges: 245, wall_balls: 290 } },
  },
};

/** Race-day slowdown applied to fresh training efforts (you arrive at each station tired). */
export const FRESH_TO_RACE = { erg: 1.06, station: 1.1 };
/** Default slowdown of HYROX 1 km runs vs open 10K race pace, until a sim/race measures yours. */
export const DEFAULT_RUN_PENALTY = 0.12;
export const MIN_RUN_PENALTY = 0.05;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ErgSession {
  date: string;
  distance_m: number;
  time_s: number;
  intervals: boolean;
}

export interface Benchmark {
  date: string;
  station: StationKey;
  time_s: number;
  amount: number | null;
  load_kg: number | null;
  fresh: boolean;
}

export interface HyroxSplits {
  kind: "race" | "full_sim" | "half_sim" | "custom";
  runs: (number | null)[];
  stations: Partial<Record<StationKey, number | null>>;
  roxzone_s: number | null;
}

export interface HyroxSession {
  date: string;
  splits: HyroxSplits;
  /** Open 10K pace (s/km) predicted from running fitness at the time of the session. */
  tenKPaceAtTime: number | null;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * 1000 m equivalent time on an erg using Paul's law (+5 s/500 m per doubling of distance).
 * Works for SkiErg and RowErg, which follow the same pacing curve closely enough.
 */
export function erg1kEquivalent(distanceM: number, timeS: number): number {
  const pace500 = (timeS / distanceM) * 500;
  const pace1k = pace500 - 5 * Math.log2(distanceM / 1000);
  return pace1k * 2;
}

/** Best 1 km-equivalent from continuous erg pieces of 500 m – 10 km. */
export function bestErg1k(sessions: ErgSession[]): { time: number; date: string } | null {
  let best: { time: number; date: string } | null = null;
  for (const s of sessions) {
    if (s.intervals || s.distance_m < 500 || s.distance_m > 10000 || s.time_s <= 0) continue;
    const t = erg1kEquivalent(s.distance_m, s.time_s);
    if (!best || t < best.time) best = { time: t, date: s.date };
  }
  return best;
}

/** Scales a benchmark to race distance/reps and race load. */
export function benchmarkToRace(b: Benchmark, division: Division): number {
  const st = STATION_BY_KEY[b.station];
  let t = b.time_s;
  if (b.amount && b.amount > 0 && b.amount !== st.amount) t *= Math.pow(st.amount / b.amount, 1.06);
  const raceLoad = st.load[division];
  if (raceLoad && b.load_kg && b.load_kg > 0 && st.loadExp) t *= Math.pow(raceLoad / b.load_kg, st.loadExp);
  return t * (b.fresh ? FRESH_TO_RACE.station : 1);
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

export type Source = "race/sim" | "benchmark" | "erg log" | "running fitness" | "reference";

export interface Segment {
  key: StationKey | "runs" | "roxzone";
  name: string;
  time: number;
  source: Source;
  detail: string;
  /** From a race/sim older than the current window — still yours, but less certain. */
  stale?: boolean;
  reference: { average: number; fast: number };
}

export interface Prediction {
  total: number;
  low: number;
  high: number;
  segments: Segment[];
  runPenalty: number;
  runPenaltySource: string;
  /** Share of predicted time that comes from your own data (0–1). */
  confidence: number;
}

export interface PredictionInput {
  division: Division;
  asOf: string;
  /** Open 10K race pace (s/km) from running fitness, or null if unknown. */
  tenKPace: number | null;
  /** Where tenKPace came from, for display (e.g. "Garmin 10K prediction"). */
  tenKSource?: string;
  skiSessions: ErgSession[];
  rowSessions: ErgSession[];
  benchmarks: Benchmark[];
  hyroxSessions: HyroxSession[];
  /** How far back data counts as current (days). */
  windowDays?: number;
  /** Older races/sims (up to this many days) still beat typical times for segments with no recent data. */
  fallbackDays?: number;
}

const UNCERTAINTY: Record<Source, number> = {
  "race/sim": 0.04,
  benchmark: 0.08,
  "erg log": 0.05,
  "running fitness": 0.05,
  reference: 0.2,
};

function daysBetween(a: string, b: string) {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

const KIND_LABEL: Record<HyroxSplits["kind"], string> = { race: "race", full_sim: "full sim", half_sim: "half sim", custom: "workout" };

function monthsAgo(date: string, asOf: string): string {
  const m = Math.round(daysBetween(date, asOf) / 30.4);
  return m <= 1 ? "1 month ago" : `${m} months ago`;
}

export function predictHyrox(input: PredictionInput): Prediction {
  const { division, asOf } = input;
  const window = input.windowDays ?? 120;
  const fallback = input.fallbackDays ?? 548;
  const inWindow = (d: string) => d <= asOf && daysBetween(d, asOf) <= window;
  const ref = REFERENCE[division];
  const byNewest = (a: HyroxSession, b: HyroxSession) => (a.date < b.date ? 1 : -1);
  const sims = input.hyroxSessions.filter((s) => inWindow(s.date)).sort(byNewest);
  // Races/sims older than the window: used only where nothing recent exists (e.g. a race 6 months ago).
  const older = input.hyroxSessions.filter((s) => s.date <= asOf && !inWindow(s.date) && daysBetween(s.date, asOf) <= fallback).sort(byNewest);
  const hasRuns = (s: HyroxSession) => s.splits.runs.filter((r) => r && r > 0).length >= 4;
  const label = (s: HyroxSession, stale: boolean) => `${KIND_LABEL[s.splits.kind]} ${s.date}${stale ? ` (${monthsAgo(s.date, asOf)})` : ""}`;

  // --- Runs: 10K pace + compromised-running penalty (measured from your latest sim/race with run splits).
  let runPenalty = DEFAULT_RUN_PENALTY;
  let runPenaltySource = "default estimate";
  const measured = sims.find((s) => s.tenKPaceAtTime && hasRuns(s)) ?? older.find((s) => s.tenKPaceAtTime && hasRuns(s));
  if (measured) {
    const rs = measured.splits.runs.filter((r): r is number => !!r && r > 0);
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    // Floor of 5%: even elites run HYROX kms ≥5% slower than open 10K pace; a lower figure means the
    // fitness estimate for that date was too slow, not that the stations cost nothing.
    runPenalty = Math.min(0.5, Math.max(MIN_RUN_PENALTY, avg / measured.tenKPaceAtTime! - 1));
    runPenaltySource = `measured in your ${label(measured, !inWindow(measured.date))}`;
  }

  const segments: Segment[] = [];
  if (input.tenKPace) {
    const perKm = input.tenKPace * (1 + runPenalty);
    segments.push({
      key: "runs",
      name: "Running 8 × 1 km",
      time: perKm * 8,
      source: "running fitness",
      detail: `${fmt(perKm)}/km (${input.tenKSource ?? "10K pace"} ${fmt(input.tenKPace)}/km + ${Math.round(runPenalty * 100)}%)`,
      reference: { average: ref.average.run * 8, fast: ref.fast.run * 8 },
    });
  } else {
    const simRuns = sims.find(hasRuns) ?? older.find(hasRuns);
    const rs = simRuns?.splits.runs.filter((r): r is number => !!r && r > 0) ?? [];
    const perKm = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : ref.average.run;
    segments.push({
      key: "runs",
      name: "Running 8 × 1 km",
      time: perKm * 8,
      source: rs.length ? "race/sim" : "reference",
      detail: simRuns ? `${fmt(perKm)}/km in your ${label(simRuns, !inWindow(simRuns.date))}` : `${fmt(perKm)}/km`,
      stale: !!simRuns && !inWindow(simRuns.date),
      reference: { average: ref.average.run * 8, fast: ref.fast.run * 8 },
    });
  }

  // --- Stations: most recent evidence wins (sim/race split, then benchmark or erg log),
  // then an older race/sim, else the typical time for the division.
  for (const st of STATIONS) {
    const candidates: { date: string; time: number; source: Source; detail: string }[] = [];
    for (const s of sims) {
      const t = s.splits.stations[st.key];
      if (t && t > 0) candidates.push({ date: s.date, time: t, source: "race/sim", detail: label(s, false) });
    }
    const bms = input.benchmarks.filter((b) => b.station === st.key && inWindow(b.date));
    if (bms.length) {
      // Best recent benchmark, scaled to race distance and load.
      const best = bms.map((b) => ({ b, t: benchmarkToRace(b, division) })).reduce((a, c) => (c.t < a.t ? c : a));
      candidates.push({ date: best.b.date, time: best.t, source: "benchmark", detail: `${fmt(best.b.time_s)} ${best.b.amount ? `for ${best.b.amount}${st.unit === "reps" ? " reps" : " m"}` : ""}${best.b.load_kg ? ` @ ${best.b.load_kg} kg` : ""} on ${best.b.date}`.replace(/\s+/g, " ") });
    }
    if (st.key === "ski" || st.key === "row") {
      const best = bestErg1k((st.key === "ski" ? input.skiSessions : input.rowSessions).filter((s) => inWindow(s.date)));
      if (best) candidates.push({ date: best.date, time: best.time * FRESH_TO_RACE.erg, source: "erg log", detail: `best 1 km-equivalent ${fmt(best.time)} (${best.date}) + 6% race fatigue` });
    }
    const latest = candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time - b.time))[0];
    const old = latest ? undefined : older.find((s) => (s.splits.stations[st.key] ?? 0) > 0);
    segments.push({
      key: st.key,
      name: st.name,
      time: latest?.time ?? old?.splits.stations[st.key] ?? ref.average.stations[st.key],
      source: latest?.source ?? (old ? "race/sim" : "reference"),
      detail: latest?.detail ?? (old ? label(old, true) : `typical ${DIVISIONS[division]} time — log a benchmark to personalise`),
      stale: !!old,
      reference: { average: ref.average.stations[st.key], fast: ref.fast.stations[st.key] },
    });
  }

  // --- Roxzone.
  const hasRox = (s: HyroxSession) => s.splits.kind !== "half_sim" && !!s.splits.roxzone_s && s.splits.roxzone_s > 0;
  const rox = sims.find(hasRox) ?? older.find(hasRox);
  segments.push({
    key: "roxzone",
    name: "Roxzone (transitions)",
    time: rox?.splits.roxzone_s ?? ref.average.roxzone,
    source: rox ? "race/sim" : "reference",
    detail: rox ? `from your ${label(rox, !inWindow(rox.date))}` : "typical transition time",
    stale: !!rox && !inWindow(rox.date),
    reference: { average: ref.average.roxzone, fast: ref.fast.roxzone },
  });

  const total = segments.reduce((a, s) => a + s.time, 0);
  const sd = Math.sqrt(segments.reduce((a, s) => a + (s.time * (s.stale ? 0.1 : UNCERTAINTY[s.source])) ** 2, 0));
  const own = segments.filter((s) => s.source !== "reference").reduce((a, s) => a + s.time, 0);
  return { total, low: total - sd, high: total + sd, segments, runPenalty, runPenaltySource, confidence: own / total };
}

/** Where the most time can be gained: gap to the "fast" reference, largest first. */
export function opportunities(p: Prediction, limit = 3) {
  return p.segments
    .map((s) => ({ name: s.name, key: s.key, gap: s.time - s.reference.fast, source: s.source }))
    .filter((o) => o.gap > 5)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return sec === 60 ? `${m + 1}:00` : `${m}:${String(sec).padStart(2, "0")}`;
}
