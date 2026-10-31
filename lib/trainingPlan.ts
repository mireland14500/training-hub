/**
 * A structured block for a heavier HYROX athlete trying to run faster:
 * run volume ramps ~10%/week with a lighter week every 4th, aerobic volume tops up on the BikeErg
 * (fitness without the pounding), ~80% easy, two or three quality sessions, and a weekly HYROX
 * session that gets more race-specific towards the race. Paces come from your latest 5K test.
 * Pure functions.
 */
import { formatPace, trainingPaces, vdotFromPerformance, predictTime } from "./analysis";

export interface PlanConfig {
  /** Monday the plan starts. */
  start: string;
  weeks: number;
  race: { name: string; date: string } | null;
  /** Running km/week now, and the peak to build to. */
  startKm: number;
  peakKm: number;
  /** Days a week you run (the Saturday HYROX session's running counts on top). */
  runDays: 4 | 5 | 6;
  /** Goal finish times in seconds. */
  goals: { singles: number | null; doubles: number | null };
}

export type SessionType = "easy" | "long" | "threshold" | "intervals" | "test" | "bike-easy" | "bike-intervals" | "brick" | "hyrox" | "strength" | "rest" | "race";

export interface PlannedSession {
  type: SessionType;
  title: string;
  detail: string;
  /** Running km in this session (0 for bike/rest). */
  km: number;
  /** Bike minutes, for BikeErg sessions. */
  bikeMin?: number;
  hard: boolean;
  /** One line for the calendar card, e.g. "9 km · 4:25–4:35/km". */
  summary?: string;
  /** Runna-style breakdown: warm-up, main set, cool-down. */
  steps?: { label: string; what: string; pace?: string }[];
}

/** Adds the calendar summary line and the step-by-step breakdown to a session. */
export function withSteps(s: PlannedSession, p: Paces): PlannedSession {
  const wu = { label: "Warm up", what: "15 min easy, then 4 × 20 s strides", pace: p.easy };
  const cd = { label: "Cool down", what: "10 min easy", pace: p.easy };
  const km = s.km ? `${Math.round(s.km)} km` : "";
  switch (s.type) {
    case "threshold":
      if (s.title === "Openers")
        return { ...s, summary: `${km} · sharpen`, steps: [{ label: "Warm up", what: "15 min easy", pace: p.easy }, { label: "Main set", what: "3 × 3 min, 2 min jog between", pace: p.threshold }, { label: "Finish", what: "4 × 20 s strides, 5 min easy" }] };
      return { ...s, summary: `${km} · ${p.threshold}/km`, steps: [wu, { label: "Main set", what: s.title.replace(/^Threshold: /, ""), pace: p.threshold }, cd] };
    case "intervals":
      return { ...s, summary: `${km} · ${p.interval}/km`, steps: [wu, { label: "Main set", what: s.title.replace(/^Intervals: /, ""), pace: p.interval }, cd] };
    case "test":
      return { ...s, summary: `${km} · all-out 5K`, steps: [wu, { label: "Test", what: "5K as fast as you can hold — even pace, empty the tank in the last km" }, cd] };
    case "easy":
    case "brick":
      return { ...s, summary: `${km || "15–20 min"} · ${p.easy}/km`, steps: [{ label: s.type === "brick" ? "Off the bike" : "Run", what: s.type === "brick" ? "15–20 min easy, straight off the BikeErg" : `${km} easy, zone 2`, pace: p.easy }] };
    case "long":
      return { ...s, summary: `${km} · ${p.long}/km`, steps: [{ label: "Run", what: `${km} conversational${/marathon pace/.test(s.detail) ? ", last 15 min at marathon pace" : ""}`, pace: p.long }] };
    case "bike-easy":
      return { ...s, summary: `${s.bikeMin ?? 35} min · zone 2`, steps: [{ label: "Ride", what: `${s.bikeMin ?? 35} min at nose-breathing effort (zone 2 HR)` }] };
    case "bike-intervals":
      return { ...s, summary: `${s.bikeMin ?? 40} min · intervals`, steps: [{ label: "Warm up", what: "10 min easy spin" }, { label: "Main set", what: s.title.replace(/^BikeErg: /, "") + " — hard = RPE 8" }, { label: "Cool down", what: "5 min easy" }] };
    case "hyrox":
      return { ...s, summary: km ? `~${km} running + stations` : "stations", steps: [{ label: "Session", what: s.detail }] };
    case "strength":
      return { ...s, summary: "45 min", steps: [{ label: "Lifts", what: "Squat or split squat, RDL, step-ups, calf raises, core — 3 × 6–10" }] };
    case "race":
      return { ...s, summary: "Race day", steps: [{ label: "Race", what: s.detail }] };
    default:
      return { ...s, summary: "Rest or easy spin" };
  }
}

export type Phase = "Base" | "Build" | "Specific" | "Taper" | "Race week";

export interface PlanWeek {
  index: number;
  start: string;
  phase: Phase;
  lighter: boolean;
  km: number;
  bikeMin: number;
  focus: string;
  days: PlannedSession[][];
}

export interface Paces {
  vdot: number;
  easy: string;
  long: string;
  marathon: string;
  threshold: string;
  interval: string;
  rep: string;
  /** Threshold pace in s/km (for km estimates). */
  thresholdS: number;
  intervalS: number;
  easyS: number;
}

const DAY = 86400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const range = (r: [number, number]) => `${formatPace(r[0])}–${formatPace(r[1])}`;

/** Training paces from a 5K time (Daniels VDOT). */
export function pacesFrom5k(fiveKSeconds: number): Paces {
  const vdot = vdotFromPerformance(5000, fiveKSeconds);
  const z = Object.fromEntries(trainingPaces(vdot).map((p) => [p.name, p.range])) as Record<string, [number, number]>;
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  return {
    vdot: Math.round(vdot * 10) / 10,
    easy: range(z.Easy),
    long: range([z.Easy[0] + 5, z.Easy[1]]),
    marathon: range(z.Marathon),
    threshold: range(z.Threshold),
    interval: range(z.Interval),
    rep: range(z.Repetition),
    thresholdS: mid(z.Threshold),
    intervalS: mid(z.Interval),
    easyS: mid(z.Easy),
  };
}

/** The Monday on or after a date. */
export function nextMonday(date: string): string {
  const dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  return dow === 0 ? date : addDays(date, 7 - dow);
}

/** Weeks from a Monday start up to and including the race week. */
export function weeksTo(start: string, raceDate: string): number {
  return Math.max(4, Math.floor((Date.parse(raceDate) - Date.parse(start)) / (7 * DAY)) + 1);
}

/** Which phase a week is in. The last two weeks taper when there's a race. */
export function phaseOf(i: number, n: number, hasRace: boolean): Phase {
  if (hasRace && i === n - 1) return "Race week";
  if (hasRace && i === n - 2) return "Taper";
  const work = hasRace ? n - 2 : n;
  if (i < Math.max(2, Math.round(work * 0.35))) return "Base";
  if (i < Math.round(work * 0.7)) return "Build";
  return "Specific";
}

/** Every 4th week is lighter (not in the taper). */
export const isLighter = (i: number, phase: Phase) => (i + 1) % 4 === 0 && phase !== "Taper" && phase !== "Race week";

/**
 * Run km per week: a straight ramp from startKm to peakKm by ~70% of the block, never more than
 * +10% on the previous full week, 80% on lighter weeks, 75% / 50% in taper / race week.
 */
export function weeklyKm(c: PlanConfig): number[] {
  const hasRace = !!c.race;
  const work = hasRace ? c.weeks - 2 : c.weeks;
  const rampTo = Math.max(1, Math.round(work * 0.7) - 1);
  const out: number[] = [];
  let lastFull = c.startKm;
  for (let i = 0; i < c.weeks; i++) {
    const phase = phaseOf(i, c.weeks, hasRace);
    if (phase === "Taper") out.push(Math.round(lastFull * 0.75));
    else if (phase === "Race week") out.push(Math.round(lastFull * 0.5));
    else {
      const target = c.startKm + (c.peakKm - c.startKm) * Math.min(1, (i + 1) / rampTo);
      const full = Math.min(target, lastFull * 1.1, c.peakKm);
      if (isLighter(i, phase)) out.push(Math.round(full * 0.8));
      else {
        lastFull = full;
        out.push(Math.round(full));
      }
    }
  }
  return out;
}

const pick = <T,>(xs: T[], k: number) => xs[k % xs.length];

/** Threshold sets by phase — total time at threshold grows from ~20 to ~30 min. */
const THRESHOLD: Record<string, { set: string; min: number }[]> = {
  Base: [
    { set: "4 × 5 min, 1 min jog", min: 20 },
    { set: "5 × 5 min, 1 min jog", min: 25 },
    { set: "3 × 8 min, 90 s jog", min: 24 },
  ],
  Build: [
    { set: "3 × 10 min, 2 min jog", min: 30 },
    { set: "4 × 8 min, 90 s jog", min: 32 },
    { set: "2 × 15 min, 3 min jog", min: 30 },
  ],
  Specific: [
    { set: "5 × 2 km, 90 s jog", min: 40 },
    { set: "25 min continuous", min: 25 },
    { set: "3 × 12 min, 2 min jog", min: 36 },
  ],
};
const INTERVALS = [
  { set: "5 × 1 km, 2 min jog", km: 5 },
  { set: "6 × 800 m, 90 s jog", km: 4.8 },
  { set: "4 × 1.2 km, 2:30 jog", km: 4.8 },
  { set: "8 × 600 m, 75 s jog", km: 4.8 },
];
const BIKE_INTERVALS: Record<string, string[]> = {
  Base: ["10 × 1 min hard / 1 min easy", "8 × 90 s hard / 90 s easy"],
  Build: ["5 × 4 min hard (RPE 8) / 2 min easy", "6 × 3 min hard / 90 s easy"],
  Specific: ["3 × (6 × 40 s all-out / 20 s easy), 4 min between", "4 × 5 min at RPE 8 / 2 min easy"],
};

function hyroxSession(phase: Phase, k: number, lighter: boolean, goalKm: string | null, weeksToRace: number | null): PlannedSession {
  const at = goalKm ? ` at goal race pace (${goalKm}/km)` : " at HYROX race pace";
  if (lighter || phase === "Taper")
    return { type: "hyrox", title: "Stations flow — easy", detail: "30–40 min moving through all 8 stations at 60–70% effort with 400 m jogs. Practise transitions, not fitness.", km: 3, hard: false };
  if (phase === "Base")
    return { type: "hyrox", title: "Strength + stations", detail: "Sled push/pull, lunges, wall balls and farmers: 3 rounds, technical and controlled. Finish with 3 × 1 km steady (RPE 6).", km: 3, hard: true };
  if (phase === "Build")
    return pick(
      [
        { type: "hyrox", title: "Compromised running", detail: `4 × (1 km${at} → station). Rotate sled push, wall balls, lunges, burpee broad jumps. 2 min between rounds.`, km: 4.5, hard: true },
        { type: "hyrox", title: "Compromised running — erg mix", detail: `5 × (1 km${at} → 500 m ski or row hard). Learn to run straight off the erg.`, km: 5.5, hard: true },
      ] as PlannedSession[],
      k,
    );
  if (weeksToRace !== null && weeksToRace === 4)
    return { type: "hyrox", title: "Full sim", detail: `All 8 runs and stations, race weights${at}. Note your splits and log it as a full sim.`, km: 8.5, hard: true };
  return pick(
    [
      { type: "hyrox", title: "Half sim", detail: `Runs 1–4 with ski, sled push, sled pull, burpee broad jumps${at}. Race intent.`, km: 4.5, hard: true },
      { type: "hyrox", title: "Back half sim", detail: `Runs 5–8 with row, farmers, lunges, wall balls${at} — the half where races are won.`, km: 4.5, hard: true },
    ] as PlannedSession[],
    k,
  );
}

/**
 * The whole plan. `paces` from your latest 5K; `goalKm` = HYROX run pace your singles goal needs.
 * `testWeeks` = weeks with a 5K test (first week if no recent test, then after each lighter week).
 */
export function buildPlan(c: PlanConfig, paces: Paces, opts: { goalKmPace: number | null; testFirstWeek: boolean; justRaced?: boolean }): PlanWeek[] {
  const kms = weeklyKm(c);
  const hasRace = !!c.race;
  const goalKm = opts.goalKmPace ? formatPace(opts.goalKmPace) : null;
  const counters: Record<string, number> = {};
  const next = (key: string) => (counters[key] = (counters[key] ?? -1) + 1);

  return kms.map((km, i) => {
    const phase = phaseOf(i, c.weeks, hasRace);
    // Straight after a race, week 1 is a lighter week and the 5K test moves to week 2.
    const lighter = isLighter(i, phase) || (i === 0 && !!opts.justRaced);
    const weekStart = addDays(c.start, i * 7);
    const weeksToRace = hasRace ? c.weeks - 1 - i : null;
    const quality = phase === "Base" ? "Base" : phase === "Build" ? "Build" : "Specific";
    const days: PlannedSession[][] = [[], [], [], [], [], [], []];
    const afterLighter = i > 0 && (isLighter(i - 1, phaseOf(i - 1, c.weeks, hasRace)) || (i === 1 && !!opts.justRaced));
    const test = (i === 0 && opts.testFirstWeek && !opts.justRaced) || (afterLighter && phase !== "Taper" && phase !== "Race week");

    // Tuesday: threshold (or a 5K test).
    if (phase === "Race week") {
      days[1].push({ type: "threshold", title: "Openers", detail: `15 min easy + 3 × 3 min at threshold (${paces.threshold}/km), 2 min jog + 4 strides.`, km: 6, hard: false });
    } else if (test) {
      days[1].push({ type: "test", title: "5K test", detail: "15 min easy + strides, then 5K all-out (parkrun or flat loop). Log the time on the Plan page — all your paces update from it.", km: 8, hard: true });
    } else {
      const t = phase === "Taper" ? { set: "3 × 6 min, 2 min jog", min: 18 } : lighter ? { set: "3 × 6 min, 90 s jog", min: 18 } : pick(THRESHOLD[quality], next(`t${quality}`));
      const workKm = (t.min * 60) / paces.thresholdS;
      days[1].push({ type: "threshold", title: `Threshold: ${t.set}`, detail: `At ${paces.threshold}/km — comfortably hard, could hold it about an hour. 15 min easy warm-up, 10 min cool-down.`, km: Math.round(workKm + 4.5), hard: true });
    }

    // Saturday: HYROX session (race on race day instead).
    const raceDow = c.race && phase === "Race week" ? (new Date(c.race.date + "T00:00:00Z").getUTCDay() + 6) % 7 : null;
    if (raceDow !== null) {
      days[raceDow].push({ type: "race", title: c.race!.name, detail: "Race day — warm-up, fuel plan, go.", km: 8, hard: true });
      if (raceDow > 0) days[raceDow - 1].push({ type: "easy", title: "Shake-out", detail: "15–20 min very easy + 4 × 20 s strides. Carb load.", km: 3, hard: false });
    } else {
      days[5].push(hyroxSession(phase, next("hyrox"), lighter, goalKm, weeksToRace));
    }

    // Thursday: run intervals on alternate weeks (5+ run days, Build/Specific), else a BikeErg session.
    const bikeHard = { type: "bike-intervals" as const, title: `BikeErg: ${pick(BIKE_INTERVALS[quality], next(`b${quality}`))}`, detail: "10 min easy spin first. Hard = breathing heavily, RPE 8; easy = genuinely easy. Fitness boost with no running impact.", km: 0, bikeMin: 40, hard: true };
    // Run intervals only when the week's km leave room for them (else bike intervals + a short run off the bike).
    const longPreview = Math.max(8, Math.min(20, Math.round(km * 0.3)));
    const fixedKm = days.flat().reduce((a, s) => a + s.km, 0) + longPreview;
    const ivPreview = pick(INTERVALS, counters.iv === undefined ? 0 : counters.iv + 1);
    const runIntervalsWeek = c.runDays >= 5 && (phase === "Build" || phase === "Specific") && i % 2 === 0 && !lighter && fixedKm + ivPreview.km + 5 + 5 <= km + 2;
    if (phase === "Race week") {
      days[3].push({ type: "rest", title: "Rest", detail: "Or a 20 min easy spin.", km: 0, hard: false });
    } else if (runIntervalsWeek) {
      const iv = pick(INTERVALS, next("iv"));
      days[3].push({ type: "intervals", title: `Intervals: ${iv.set}`, detail: `At ${paces.interval}/km. 15 min easy warm-up with strides, 10 min cool-down.`, km: Math.round(iv.km + 5), hard: true });
    } else if (phase === "Taper" || lighter) {
      days[3].push({ type: "bike-easy", title: "BikeErg easy", detail: "30–40 min conversational spin.", km: 0, bikeMin: 35, hard: false });
    } else {
      days[3].push(bikeHard);
      if (c.runDays >= 5) days[3].push({ type: "brick", title: "Run off the bike", detail: `Straight off the BikeErg: 15–20 min easy (${paces.easy}/km). Teaches the legs to run tired.`, km: 3, hard: false });
    }

    // Sunday: long run (≤ 30% of the week; capped at 20 km while carrying more weight).
    const longKm = phase === "Race week" ? 0 : Math.max(8, Math.min(20, Math.round(km * 0.3)));
    if (longKm) {
      const finish = phase === "Specific" && !lighter && i % 2 === 1 ? ` Last 15 min at marathon pace (${paces.marathon}/km).` : "";
      days[6].push({ type: "long", title: `Long run ${longKm} km`, detail: `Easy, conversational — ${paces.long}/km. Walk the drink stops if you need to.${finish}`, km: longKm, hard: false });
    }

    // Monday: rest or recovery spin. Friday: BikeErg aerobic volume (+ easy run with 6 run days).
    const bikeZ2 = phase === "Race week" ? 0 : phase === "Taper" || lighter ? 40 : quality === "Base" ? 50 : quality === "Build" ? 60 : 70;
    days[0].push({ type: "rest", title: "Rest", detail: "Or 20–30 min very easy spin to loosen up.", km: 0, hard: false });
    if (bikeZ2) days[4].push({ type: "bike-easy", title: `BikeErg aerobic ${bikeZ2} min`, detail: "Zone 2: nose-breathing pace. This is where the bike earns its keep — aerobic volume without the impact of extra running.", km: 0, bikeMin: bikeZ2, hard: false });

    // Easy runs fill the rest of the week's km: Wednesday (+ gym), then Friday — never longer than
    // ~75% of the long run; anything beyond that is simply left off (a lighter week stays light).
    const used = days.flat().reduce((a, s) => a + s.km, 0);
    const cap = Math.max(5, Math.round((longKm || 8) * 0.75));
    const easyDays = phase === "Race week" ? [] : c.runDays >= 6 ? [2, 4] : c.runDays >= 5 ? [2, 4] : [2];
    let left = Math.max(0, km - used);
    easyDays.forEach((d, k) => {
      const isExtra = d === 4 && c.runDays < 6;
      if (isExtra && (lighter || phase === "Taper")) return;
      if (d === 4 && left < 4) return;
      // With 6 run days Wednesday and Friday share the km; otherwise Wednesday fills first.
      const even = c.runDays >= 6 ? left / (easyDays.length - k) : left;
      const share = Math.min(cap, isExtra || d === 4 ? Math.round(left) : Math.max(5, Math.round(even)));
      if (isExtra && share < 4) return;
      left -= share;
      const strides = d === 2 && quality === "Base" ? " Finish with 6 × 20 s strides." : "";
      days[d].push({ type: "easy", title: `Easy run ${share} km`, detail: `${paces.easy}/km, HR in zone 2.${strides}${d === 4 ? " Before or after the bike." : ""}`, km: share, hard: false });
    });
    if (phase !== "Race week") days[2].push({ type: "strength", title: "Gym: strength", detail: "Squat or split squat, RDL, step-ups, calf raises, core — 3 × 6–10. Keeps sleds strong and legs injury-proof as mileage climbs.", km: 0, hard: false });

    const bikeMin = days.flat().reduce((a, s) => a + (s.bikeMin ?? 0), 0);
    const focus =
      phase === "Base"
        ? "Build the running habit and volume; threshold once a week; BikeErg for extra aerobic work."
        : phase === "Build"
          ? "Longer threshold, VO2 intervals or bike intervals, compromised running."
          : phase === "Specific"
            ? "Race-pace HYROX work, sims, longest threshold sessions."
            : phase === "Taper"
              ? "Volume down, keep a little intensity. Arrive fresh."
              : "Openers, rest, carb load, race.";
    return { index: i, start: weekStart, phase, lighter, km: Math.round(days.flat().reduce((a, s) => a + s.km, 0)), bikeMin, focus: lighter ? "Lighter week — absorb the training." : focus, days: days.map((d) => d.map((x) => withSteps(x, paces))) };
  });
}

/**
 * What a goal finish needs from your running: HYROX km pace, the open 10K and 5K that usually go with it.
 * `nonRun` = predicted stations + Roxzone; `runPenalty` = how much slower your HYROX kms are than open 10K pace.
 */
export function goalRunning(goalS: number, nonRun: number, runPenalty: number) {
  const kmPace = (goalS - nonRun) / 8;
  if (kmPace <= 150) return null;
  const tenKPace = kmPace / (1 + runPenalty);
  const vdot = vdotFromPerformance(10000, tenKPace * 10);
  return { kmPace, tenKPace, fiveK: predictTime(vdot, 5000), vdot };
}
