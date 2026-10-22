// Pure training-science helpers. No I/O here so everything is unit-testable.

export type Sex = "male" | "female";

export interface AthleteProfile {
  sex: Sex;
  max_hr: number;
  resting_hr: number;
  threshold_hr: number;
}

// ---------------------------------------------------------------------------
// Training load
// ---------------------------------------------------------------------------

/** Banister TRIMP for a session at a given average heart rate. */
export function trimp(durationMin: number, avgHr: number, p: AthleteProfile): number {
  const hrr = clamp((avgHr - p.resting_hr) / (p.max_hr - p.resting_hr), 0, 1);
  const k = p.sex === "female" ? 1.67 : 1.92;
  const y = p.sex === "female" ? 0.86 : 0.64;
  return durationMin * hrr * y * Math.exp(k * hrr);
}

/**
 * Heart-rate training stress, scaled so one hour at threshold HR = 100
 * (the same scale as TSS / hrTSS).
 */
export function hrLoad(durationS: number, avgHr: number, p: AthleteProfile): number {
  const perHourAtThreshold = trimp(60, p.threshold_hr, p);
  if (perHourAtThreshold <= 0) return 0;
  return (trimp(durationS / 60, avgHr, p) / perHourAtThreshold) * 100;
}

/** Session-RPE load (Foster), scaled so 1 h at RPE 7 (~threshold) ≈ 100. */
export function rpeLoad(durationS: number, rpe: number): number {
  return ((durationS / 60) * rpe) / 4.2;
}

export interface LoadInput {
  duration_s: number;
  avg_hr?: number | null;
  rpe?: number | null;
  suffer_score?: number | null;
}

/** Picks the best available method: HR > RPE > Strava relative effort > duration. */
export function sessionLoad(a: LoadInput, p: AthleteProfile): { load: number; method: string } {
  if (a.avg_hr && a.avg_hr > p.resting_hr) {
    return { load: round(hrLoad(a.duration_s, a.avg_hr, p), 1), method: "hr" };
  }
  if (a.rpe) return { load: round(rpeLoad(a.duration_s, a.rpe), 1), method: "rpe" };
  if (a.suffer_score) return { load: round(a.suffer_score, 1), method: "strava" };
  // Unknown intensity: assume easy aerobic work (~RPE 3).
  return { load: round(rpeLoad(a.duration_s, 3), 1), method: "duration" };
}

// ---------------------------------------------------------------------------
// Fitness / fatigue / form (performance management chart)
// ---------------------------------------------------------------------------

export interface PmcPoint {
  date: string; // YYYY-MM-DD
  load: number;
  ctl: number; // fitness, 42-day
  atl: number; // fatigue, 7-day
  tsb: number; // form = yesterday's ctl - atl
}

/** `dailyLoads` maps YYYY-MM-DD → summed load. Produces one point per day. */
export function pmc(dailyLoads: Map<string, number>, from: string, to: string): PmcPoint[] {
  const out: PmcPoint[] = [];
  let ctl = 0;
  let atl = 0;
  const kc = 1 - Math.exp(-1 / 42);
  const ka = 1 - Math.exp(-1 / 7);
  for (const date of dateRange(from, to)) {
    const load = dailyLoads.get(date) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    out.push({ date, load: round(load, 1), ctl: round(ctl, 1), atl: round(atl, 1), tsb: round(tsb, 1) });
  }
  return out;
}

/** Acute:chronic workload ratio (7-day vs 28-day weekly average). */
export function acwr(points: PmcPoint[]): number | null {
  if (points.length < 28) return null;
  const last28 = points.slice(-28);
  const acute = sum(last28.slice(-7).map((p) => p.load));
  const chronic = sum(last28.map((p) => p.load)) / 4;
  if (chronic < 1) return null;
  return round(acute / chronic, 2);
}

/** Foster monotony (mean / sd of daily load, last 7 days). High = too samey. */
export function monotony(points: PmcPoint[]): number | null {
  const week = points.slice(-7).map((p) => p.load);
  if (week.length < 7) return null;
  const mean = sum(week) / 7;
  const sd = Math.sqrt(sum(week.map((x) => (x - mean) ** 2)) / 7);
  if (sd === 0) return null;
  return round(mean / sd, 2);
}

// ---------------------------------------------------------------------------
// Heart-rate zones (Friel, % of threshold HR)
// ---------------------------------------------------------------------------

export const HR_ZONE_NAMES = ["Z1 Recovery", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max"];
const ZONE_UPPER = [0.85, 0.9, 0.95, 1.0]; // upper bounds of Z1..Z4 as fraction of LTHR

export function hrZone(hr: number, thresholdHr: number): number {
  const f = hr / thresholdHr;
  for (let i = 0; i < ZONE_UPPER.length; i++) if (f < ZONE_UPPER[i]) return i;
  return 4;
}

export function hrZoneBounds(thresholdHr: number): { name: string; min: number; max: number | null }[] {
  const edges = [0, ...ZONE_UPPER.map((f) => Math.round(f * thresholdHr))];
  return HR_ZONE_NAMES.map((name, i) => ({ name, min: edges[i], max: i < 4 ? edges[i + 1] - 1 : null }));
}

/** Seconds in each of the 5 zones, from paired time (s) and heart-rate streams. */
export function zoneSeconds(time: number[], hr: number[], thresholdHr: number): number[] {
  const zones = [0, 0, 0, 0, 0];
  for (let i = 1; i < time.length && i < hr.length; i++) {
    const dt = time[i] - time[i - 1];
    if (dt <= 0 || dt > 30) continue; // skip pauses
    zones[hrZone(hr[i], thresholdHr)] += dt;
  }
  return zones;
}

// ---------------------------------------------------------------------------
// Running: best efforts, critical speed, VDOT, paces, predictions
// ---------------------------------------------------------------------------

export const EFFORT_DURATIONS = [180, 360, 720, 1200, 1800, 3600];

/**
 * Best distance (m) covered in each target duration, using two pointers over the
 * time/distance streams. Returns { "180": metres, ... } for durations that fit.
 */
export function bestEfforts(time: number[], distance: number[], durations = EFFORT_DURATIONS): Record<string, number> {
  const out: Record<string, number> = {};
  const n = Math.min(time.length, distance.length);
  if (n < 2) return out;
  for (const d of durations) {
    if (time[n - 1] - time[0] < d) continue;
    let best = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j < n && time[j] - time[i] < d) j++;
      if (j >= n) break;
      // Interpolate distance at exactly time[i] + d.
      const t0 = time[j - 1];
      const t1 = time[j];
      const frac = t1 === t0 ? 1 : (time[i] + d - t0) / (t1 - t0);
      const distAt = distance[j - 1] + frac * (distance[j] - distance[j - 1]);
      best = Math.max(best, distAt - distance[i]);
    }
    if (best > 0) out[String(d)] = round(best, 1);
  }
  return out;
}

/**
 * Critical speed from best efforts: linear fit distance = CS · t + D'.
 * Uses 3–20 minute efforts, which is where the 2-parameter model holds.
 */
export function criticalSpeed(efforts: Record<string, number>): { cs: number; dPrime: number } | null {
  const pts = Object.entries(efforts)
    .map(([t, d]) => [Number(t), d] as const)
    .filter(([t]) => t >= 180 && t <= 1200);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mt = sum(pts.map((p) => p[0])) / n;
  const md = sum(pts.map((p) => p[1])) / n;
  const num = sum(pts.map(([t, d]) => (t - mt) * (d - md)));
  const den = sum(pts.map(([t]) => (t - mt) ** 2));
  if (den === 0) return null;
  const cs = num / den;
  const dPrime = md - cs * mt;
  if (cs <= 0 || dPrime < 0) return null;
  return { cs: round(cs, 3), dPrime: round(dPrime, 0) };
}

/** Daniels/Gilbert VDOT from a performance (distance in metres, time in seconds). */
export function vdotFromPerformance(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  const v = distanceM / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}

/** Running speed (m/s) that costs `vo2` ml/kg/min (inverse of the Daniels cost curve). */
export function speedForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(vo2 + 4.6);
  const vMin = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return vMin / 60;
}

/** Predicted race time (s) for a distance at a given VDOT (bisection). */
export function predictTime(vdot: number, distanceM: number): number {
  let lo = distanceM / 8; // faster than world record pace
  let hi = distanceM / 1; // 1 m/s
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromPerformance(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Riegel prediction from a known result, for comparison. */
export function riegel(knownDistM: number, knownTimeS: number, targetDistM: number, exp = 1.06): number {
  return knownTimeS * Math.pow(targetDistM / knownDistM, exp);
}

export interface PaceZone {
  name: string;
  purpose: string;
  /** seconds per km; [fast, slow] */
  range: [number, number];
}

/** Daniels training paces as % of VDOT (VO2 cost). */
export function trainingPaces(vdot: number): PaceZone[] {
  const pace = (pct: number) => 1000 / speedForVo2(vdot * pct);
  return [
    { name: "Easy", purpose: "Aerobic base, recovery, most of your mileage", range: [pace(0.74), pace(0.62)] },
    { name: "Marathon", purpose: "Long-run finish, marathon-specific", range: [pace(0.84), pace(0.79)] },
    { name: "Threshold", purpose: "Tempo runs and cruise intervals (20–40 min total)", range: [pace(0.9), pace(0.86)] },
    { name: "Interval", purpose: "VO2max, 3–5 min reps", range: [pace(1.0), pace(0.96)] },
    { name: "Repetition", purpose: "Speed & economy, 200–400 m reps", range: [pace(1.1), pace(1.04)] },
  ];
}

/** Threshold speed (m/s) from critical speed (CS sits a little above 1-hour pace). */
export function thresholdFromCs(cs: number): number {
  return cs * 0.96;
}

/** VDOT implied by a threshold speed (threshold ≈ 88% VO2max cost). */
export function vdotFromThresholdSpeed(speedMs: number): number {
  const v = speedMs * 60;
  return (-4.6 + 0.182258 * v + 0.000104 * v * v) / 0.88;
}

/** Efficiency factor: metres per minute per heartbeat (higher = fitter). */
export function efficiencyFactor(distanceM: number, movingS: number, avgHr: number): number {
  return round(distanceM / (movingS / 60) / avgHr, 3);
}

/** Aerobic decoupling (%): EF first half vs second half. <5% = good aerobic durability. */
export function decoupling(time: number[], distance: number[], hr: number[]): number | null {
  const n = Math.min(time.length, distance.length, hr.length);
  if (n < 20) return null;
  const mid = Math.floor(n / 2);
  const ef = (a: number, b: number) => {
    const d = distance[b - 1] - distance[a];
    const t = time[b - 1] - time[a];
    const h = sum(hr.slice(a, b)) / (b - a);
    return t > 0 && h > 0 ? d / t / h : 0;
  };
  const first = ef(0, mid);
  const second = ef(mid, n);
  if (first === 0) return null;
  return round(((first - second) / first) * 100, 1);
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface CheckinLike {
  date: string;
  sleep_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  body_battery?: number | null;
  soreness?: number | null; // 1 none – 5 very sore
  energy?: number | null; // 1 drained – 5 great
}

export interface Readiness {
  score: number;
  label: "Primed" | "Ready" | "Moderate" | "Recover";
  factors: { name: string; score: number; detail: string }[];
}

/**
 * Combines form (TSB) with today's check-in and personal baselines into a 0–100 score.
 * Each factor is scored 0–100 and averaged with weights; missing factors are skipped.
 */
export function readiness(tsb: number | null, today: CheckinLike | null, history: CheckinLike[]): Readiness {
  const f: { name: string; score: number; detail: string; w: number }[] = [];

  if (tsb !== null) {
    // −30 → 0, +10 → 100 (very fresh is also slightly penalised as detraining).
    const s = tsb > 20 ? 85 : clamp(((tsb + 30) / 40) * 100, 0, 100);
    f.push({ name: "Form (TSB)", score: s, detail: `${tsb > 0 ? "+" : ""}${tsb.toFixed(0)}`, w: 2 });
  }
  if (today) {
    const base = history.filter((c) => c.date < today.date).slice(-28);
    if (today.hrv_ms) {
      const vals = base.map((c) => c.hrv_ms).filter(isNum);
      if (vals.length >= 3) {
        const m = mean(vals);
        const sd = Math.max(stdev(vals), m * 0.05);
        const z = (today.hrv_ms - m) / sd;
        f.push({ name: "HRV vs baseline", score: clamp(70 + z * 20, 0, 100), detail: `${today.hrv_ms} ms (avg ${m.toFixed(0)})`, w: 2 });
      } else {
        f.push({ name: "HRV vs baseline", score: 70, detail: `${today.hrv_ms} ms (building baseline)`, w: 0.5 });
      }
    }
    if (today.resting_hr) {
      const vals = base.map((c) => c.resting_hr).filter(isNum);
      if (vals.length >= 3) {
        const diff = today.resting_hr - mean(vals);
        f.push({ name: "Resting HR", score: clamp(75 - diff * 10, 0, 100), detail: `${today.resting_hr} bpm (${diff >= 0 ? "+" : ""}${diff.toFixed(1)})`, w: 1.5 });
      }
    }
    if (isNum(today.sleep_score)) f.push({ name: "Sleep score", score: today.sleep_score, detail: String(today.sleep_score), w: 1.5 });
    if (isNum(today.body_battery)) f.push({ name: "Body Battery", score: today.body_battery, detail: String(today.body_battery), w: 1 });
    if (isNum(today.soreness)) f.push({ name: "Soreness", score: ((5 - today.soreness) / 4) * 100, detail: `${today.soreness}/5`, w: 1 });
    if (isNum(today.energy)) f.push({ name: "Energy", score: ((today.energy - 1) / 4) * 100, detail: `${today.energy}/5`, w: 1 });
  }

  const totalW = sum(f.map((x) => x.w));
  const score = totalW ? Math.round(sum(f.map((x) => x.score * x.w)) / totalW) : 50;
  const label = score >= 80 ? "Primed" : score >= 65 ? "Ready" : score >= 45 ? "Moderate" : "Recover";
  return { score, label, factors: f.map(({ name, score, detail }) => ({ name, score: Math.round(score), detail })) };
}

export interface CueInput {
  readiness: Readiness;
  tsb: number | null;
  acwr: number | null;
  monotony: number | null;
  hardDaysInRow: number;
  daysSinceHard: number | null;
  intensityShareHard: number | null; // fraction of last-28-day time in Z3+
}

/** Plain-language coaching suggestions for today. */
export function coachingCues(c: CueInput): string[] {
  const cues: string[] = [];
  if (c.readiness.label === "Recover") cues.push("Readiness is low — rest, mobility, or a short Z1 session today.");
  else if (c.readiness.label === "Primed" && (c.daysSinceHard ?? 99) >= 2) cues.push("You're fresh — a good day for a key session (threshold or intervals).");
  if (c.hardDaysInRow >= 2) cues.push(`${c.hardDaysInRow} hard days in a row — keep today easy.`);
  if (c.acwr !== null && c.acwr > 1.5) cues.push(`Load spike: this week is ${c.acwr}× your usual. Injury risk rises above ~1.5 — ease off.`);
  else if (c.acwr !== null && c.acwr < 0.8) cues.push("Training load is dropping below your usual — fine for a taper, otherwise add volume gradually.");
  if (c.monotony !== null && c.monotony > 2) cues.push("Your days are very similar in load — vary hard and easy days more.");
  if (c.intensityShareHard !== null && c.intensityShareHard > 0.3) cues.push(`${Math.round(c.intensityShareHard * 100)}% of your time is Z3+. Aim for ~80% easy to build aerobic base.`);
  if (c.tsb !== null && c.tsb < -30) cues.push("Form is very negative (deep fatigue). Plan a recovery week.");
  if (!cues.length) cues.push("All signals look balanced — train as planned.");
  return cues;
}

// ---------------------------------------------------------------------------
// Formatting & utils
// ---------------------------------------------------------------------------

export function formatPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** SkiErg / rower pace per 500 m from watts (Concept2 formula). */
export function pace500FromWatts(watts: number): number {
  return 500 * Math.cbrt(2.8 / watts);
}

export function wattsFromPace500(pace500S: number): number {
  return 2.8 / Math.pow(pace500S / 500, 3);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function round(x: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
function mean(xs: number[]) {
  return sum(xs) / xs.length;
}
function stdev(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
}
function isNum(x: unknown): x is number {
  return typeof x === "number" && isFinite(x);
}
