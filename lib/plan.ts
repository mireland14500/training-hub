// Weekly training advice: whether to add, keep, or cut sessions, from load, fatigue and readiness.
// Pure functions — data loading lives in lib/data.ts.

import type { PmcPoint } from "./analysis";

export type Category = "run" | "erg" | "hyrox" | "strength" | "other";

const RUN = ["Run", "TrailRun", "VirtualRun"];
const ERG = ["SkiErg", "RowErg", "BikeErg", "Rowing", "VirtualRow", "NordicSki"];
const STRENGTH = ["WeightTraining", "Workout", "Crossfit", "HighIntensityIntervalTraining", "StairStepper"];

export function categorize(sport: string, name: string | null): Category {
  if (sport === "HYROX" || /hyrox|\bsim\b|compromised|roxzone|wall ?balls?|sled/i.test(name ?? "")) return "hyrox";
  if (RUN.includes(sport)) return "run";
  if (ERG.includes(sport)) return "erg";
  if (STRENGTH.includes(sport)) return "strength";
  return "other";
}

export interface SessionSummary {
  date: string; // YYYY-MM-DD
  category: Category;
  load: number;
  durationS: number;
  hard: boolean; // ≥10 min in Z4+, RPE ≥ 8, or load ≥ 100
  quality: boolean; // structured hard run (tempo/threshold/intervals)
}

export type Verdict = "taper" | "deload" | "reduce" | "maintain" | "add";

export interface Suggestion {
  action: "add" | "drop" | "swap" | "keep";
  session: string;
  why: string;
}

export interface MixItem {
  label: string;
  count: number;
  ideal: [number, number];
  status: "low" | "ok" | "high";
}

export interface PlanAdvice {
  verdict: Verdict;
  headline: string;
  reasons: string[];
  target: { low: number; high: number };
  weekSoFar: number;
  daysLeft: number;
  rampRate: number; // fitness (CTL) change over the last 7 days
  suggestions: Suggestion[];
  mix: MixItem[];
}

export interface PlanInput {
  today: string;
  pmc: PmcPoint[]; // daily, ending today
  acwr: number | null;
  readinessToday: number | null;
  readinessRecent: number[]; // last few days' readiness scores (most recent last)
  hardShare: number | null; // share of HR-zone time in Z3+ over 28 days
  sessions: SessionSummary[]; // last ~35 days
  daysToGoal: number | null;
  thresholdPace: string | null; // e.g. "4:12"
  weakStations: string[]; // biggest HYROX time losses, e.g. ["Wall Balls 100 reps"]
}

const MULTIPLIER: Record<Verdict, [number, number]> = {
  add: [1.05, 1.15],
  maintain: [0.95, 1.05],
  reduce: [0.8, 0.9],
  deload: [0.55, 0.7],
  taper: [0.5, 0.65],
};

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

export function weeklyPlan(i: PlanInput): PlanAdvice {
  const reasons: string[] = [];
  const latest = i.pmc[i.pmc.length - 1];
  const weekAgo = i.pmc[i.pmc.length - 8];
  const ctl = latest?.ctl ?? 0;
  const tsb = latest?.tsb ?? 0;
  const rampRate = latest && weekAgo ? Math.round((latest.ctl - weekAgo.ctl) * 10) / 10 : 0;
  const recentReady = i.readinessRecent.length ? i.readinessRecent.reduce((a, b) => a + b, 0) / i.readinessRecent.length : null;

  // Weekly loads of the last 3 complete weeks, to spot long build blocks.
  const thisWeek = weekStart(i.today);
  const weekLoads = [3, 2, 1].map((w) => {
    const start = addDays(thisWeek, -7 * w);
    const end = addDays(start, 6);
    return i.sessions.filter((s) => s.date >= start && s.date <= end).reduce((a, s) => a + s.load, 0);
  });
  const buildingWeeks = weekLoads[0] > 0 && weekLoads[1] > weekLoads[0] * 1.03 && weekLoads[2] > weekLoads[1] * 1.03;

  let verdict: Verdict;
  if (i.daysToGoal !== null && i.daysToGoal <= 10) {
    verdict = "taper";
    reasons.push(`Race in ${i.daysToGoal} days — time to taper so you arrive fresh.`);
  } else if ((i.acwr ?? 0) > 1.5 || tsb < -30 || (recentReady !== null && recentReady < 45)) {
    verdict = "deload";
    if ((i.acwr ?? 0) > 1.5) reasons.push(`This week's load is ${i.acwr}× your usual — a spike that raises injury risk.`);
    if (tsb < -30) reasons.push(`Form is ${Math.round(tsb)}: deep accumulated fatigue.`);
    if (recentReady !== null && recentReady < 45) reasons.push(`Readiness has averaged ${Math.round(recentReady)} over the last few days.`);
  } else if ((i.acwr ?? 0) > 1.3 || tsb < -20 || (recentReady !== null && recentReady < 55) || (buildingWeeks && (i.readinessToday ?? 70) < 65)) {
    verdict = "reduce";
    if ((i.acwr ?? 0) > 1.3) reasons.push(`Load is ramping fast (acute:chronic ${i.acwr}).`);
    if (tsb < -20) reasons.push(`Form is ${Math.round(tsb)} — you're carrying a lot of fatigue.`);
    if (recentReady !== null && recentReady < 55) reasons.push(`Readiness has been low recently (avg ${Math.round(recentReady)}).`);
    if (buildingWeeks) reasons.push("You've built load for 3 weeks straight — most athletes absorb training better with a lighter week every 3–4 weeks.");
  } else if ((i.acwr === null || i.acwr < 0.9) && tsb > -5 && (i.readinessToday ?? 70) >= 65) {
    verdict = "add";
    reasons.push(i.acwr === null ? "Not much recent training — room to build." : `Load is below your usual (acute:chronic ${i.acwr}) and you're fresh (form ${Math.round(tsb)}).`);
  } else {
    verdict = "maintain";
    reasons.push(`Load and fatigue are balanced (acute:chronic ${i.acwr ?? "–"}, form ${Math.round(tsb)}).`);
    if (rampRate < 2 && (i.readinessToday ?? 70) >= 70 && !buildingWeeks) reasons.push("Fitness is rising slowly — you could add a little if you want faster progress.");
    if (buildingWeeks) reasons.push("3 build weeks in a row — plan a lighter week soon.");
  }
  if (rampRate > 7) reasons.push(`Fitness jumped ${rampRate} points this week — above ~5–7/week is hard to sustain.`);

  // Session mix over the last 14 days.
  const since14 = addDays(i.today, -13);
  const last14 = i.sessions.filter((s) => s.date >= since14);
  const count = (f: (s: SessionSummary) => boolean) => last14.filter(f).length;
  const runs = count((s) => s.category === "run");
  const quality = count((s) => s.category === "run" && s.quality);
  const longRun = i.sessions.some((s) => s.category === "run" && s.durationS >= 75 * 60 && s.date >= addDays(i.today, -10));
  const strength = count((s) => s.category === "strength");
  const hyrox = count((s) => s.category === "hyrox");
  const ergs = count((s) => s.category === "erg");
  const mixItem = (label: string, n: number, ideal: [number, number]): MixItem => ({ label, count: n, ideal, status: n < ideal[0] ? "low" : n > ideal[1] ? "high" : "ok" });
  const mix = [
    mixItem("Runs", runs, [5, 8]),
    mixItem("Quality runs (tempo/intervals)", quality, [2, 3]),
    mixItem("Strength / station work", strength + hyrox, [3, 5]),
    mixItem("HYROX sims / compromised runs", hyrox, [1, 2]),
    mixItem("SkiErg / Row", ergs, [2, 4]),
  ];

  const weak = i.weakStations.slice(0, 2).join(" and ") || "your weakest stations";
  const tp = i.thresholdPace ? ` at ${i.thresholdPace}/km` : "";
  const suggestions: Suggestion[] = [];

  if (verdict === "taper") {
    suggestions.push({ action: "drop", session: "Cut volume 40–50% vs a normal week", why: "Fitness won't drop in 10 days; fatigue will." });
    suggestions.push({ action: "keep", session: "One short race-pace session 4–5 days out (e.g. 4 × 1 km at race pace + 1 station each, short)", why: "Keeps you sharp without adding fatigue." });
    suggestions.push({ action: "keep", session: "Rest or a 20-min shake-out the 2 days before", why: "Arrive with full glycogen and fresh legs." });
  } else if (verdict === "deload") {
    suggestions.push({ action: "drop", session: "Cut this week to ~60% of normal: shorten sessions and add 1–2 rest days", why: "Lets the training you've done turn into fitness." });
    suggestions.push({ action: "swap", session: "Make all but one session easy (Z1–Z2)", why: "Keep one short quality session so you don't go stale." });
  } else if (verdict === "reduce") {
    if ((i.hardShare ?? 0) > 0.25 || count((s) => s.hard) >= 5) {
      suggestions.push({ action: "swap", session: "Turn your next hard session into an easy Z2 one", why: "Too much of your recent training has been hard." });
    }
    suggestions.push({ action: "drop", session: "Drop one easy session this week, or shorten sessions by ~25%", why: "Bring load back towards your usual level." });
  } else {
    const adds: Suggestion[] = [];
    if (hyrox === 0 && (i.daysToGoal === null || i.daysToGoal <= 112)) {
      adds.push({ action: "add", session: `Compromised running: 4–6 × (1 km at race pace → ${weak})`, why: "No HYROX-specific work in 2 weeks — running well off the stations is the biggest HYROX skill." });
    }
    if (strength + hyrox < 3) adds.push({ action: "add", session: `Station strength session: ${weak}, sled push/pull, lunges`, why: `Only ${strength + hyrox} strength/station sessions in 2 weeks.` });
    if (!longRun) adds.push({ action: "add", session: "Long easy run, 75–90 min in Z2", why: "No long run in 10 days — it builds the aerobic engine for 8 km of racing." });
    if (quality < 2) adds.push({ action: "add", session: `Threshold run: 3 × 10 min${tp} with 2 min easy`, why: `Only ${quality} quality run${quality === 1 ? "" : "s"} in 2 weeks.` });
    if (ergs < 2) adds.push({ action: "add", session: "SkiErg/Row intervals: 5 × 500 m at race effort, 1 min rest", why: "Erg stations are 2 of the 8 — little erg work recently." });
    adds.push({ action: "add", session: "Easy 30–45 min Z2 run or easy erg", why: "The cheapest way to add aerobic volume with little fatigue." });
    if (verdict === "add") suggestions.push(adds[0]);
    else suggestions.push({ action: "keep", session: "Keep your planned sessions", why: "You're absorbing the current load well." });
    if (verdict === "maintain" && adds[0].session !== adds[adds.length - 1].session) {
      suggestions.push({ ...adds[0], action: "swap", why: `If you swap a session, make it this — ${adds[0].why.charAt(0).toLowerCase()}${adds[0].why.slice(1)}` });
    }
  }

  const headline = {
    taper: "Taper week — less volume, stay sharp",
    deload: "Take a lighter week",
    reduce: "Ease off a little this week",
    maintain: "Keep training as planned",
    add: "You can add a session this week",
  }[verdict];

  const base = Math.max(ctl * 7, 150);
  const [lo, hi] = MULTIPLIER[verdict];
  const weekSoFar = i.sessions.filter((s) => s.date >= thisWeek && s.date <= i.today).reduce((a, s) => a + s.load, 0);
  const daysLeft = 6 - ((new Date(i.today + "T00:00:00Z").getUTCDay() + 6) % 7);

  return {
    verdict,
    headline,
    reasons,
    target: { low: Math.round(base * lo), high: Math.round(base * hi) },
    weekSoFar: Math.round(weekSoFar),
    daysLeft,
    rampRate,
    suggestions,
    mix,
  };
}
