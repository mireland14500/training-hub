/**
 * Body-fat goal planning: a gentle deficit between races, never in race week.
 * Pure functions — the Body page and Today card feed them.
 */

export interface Race {
  id?: string;
  name: string;
  date: string;
}

export interface BodyGoal {
  target_fat_pct: number;
  start_date: string;
  target_date: string;
  start_weight: number;
  start_fat_pct: number;
}

export interface WeighIn {
  date: string;
  weight_kg: number;
}

export type Phase = "race-week" | "race-day" | "recover" | "deficit" | "maintain";

const DAY = 86400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

/** Weight at the target body-fat %, keeping today's lean mass (the point is to lose fat, not muscle). */
export function targetWeight(weight: number, fatPct: number, targetFatPct: number): number {
  const lean = weight * (1 - fatPct / 100);
  return Math.round((lean / (1 - targetFatPct / 100)) * 10) / 10;
}

/** Fat loss per week the goal needs, as % of body weight (0.5–0.75 %/week keeps training quality). */
export function weeklyRatePct(g: BodyGoal): number {
  const weeks = Math.max(1, days(g.start_date, g.target_date) / 7);
  const loss = g.start_weight - targetWeight(g.start_weight, g.start_fat_pct, g.target_fat_pct);
  return Math.round(((loss / weeks / g.start_weight) * 100) * 100) / 100;
}

/** Below this, performance and hormones tend to suffer — don't plan under it. */
export function leanFloor(sex: string): number {
  return sex === "female" ? 18 : 10;
}

/**
 * A goal worth suggesting: what a gentle 0.5 %/week reaches by the target date, at most 3 points
 * per block (fat loss slows the leaner you get), and never under the lean floor.
 */
export function suggestedTarget(g: Omit<BodyGoal, "target_fat_pct">, sex: string): number {
  const t = Math.max(realisticTarget(g, 0.005), g.start_fat_pct - 3, leanFloor(sex));
  return Math.min(g.start_fat_pct, Math.ceil(t * 2) / 2);
}

/** The lowest body-fat % reachable by the target date losing `rate` of body weight a week. */
export function realisticTarget(g: Omit<BodyGoal, "target_fat_pct">, rate = 0.006): number {
  const weeks = Math.max(0, days(g.start_date, g.target_date) / 7);
  const lossKg = g.start_weight * rate * weeks;
  const fatKg = g.start_weight * (g.start_fat_pct / 100);
  return Math.round(Math.max(5, ((fatKg - lossKg) / (g.start_weight - lossKg)) * 100) * 10) / 10;
}

/**
 * Where you are on the calendar:
 * race day · race week (6 days before: no deficit, top up carbs) · recover (3 days after) ·
 * deficit (inside the goal window) · maintain (no goal running).
 */
export function phaseOn(date: string, races: Race[], goal: BodyGoal | null): { phase: Phase; race?: Race; daysTo?: number } {
  for (const r of races) {
    const d = days(date, r.date);
    if (d === 0) return { phase: "race-day", race: r, daysTo: 0 };
    if (d > 0 && d <= 6) return { phase: "race-week", race: r, daysTo: d };
    if (d < 0 && d >= -3) return { phase: "recover", race: r, daysTo: d };
  }
  if (goal && date >= goal.start_date && date <= goal.target_date) return { phase: "deficit" };
  return { phase: "maintain" };
}

/** Planned weight on a date: straight line from start to target, flat through race weeks is close enough. */
export function plannedWeight(g: BodyGoal, date: string): number {
  const end = targetWeight(g.start_weight, g.start_fat_pct, g.target_fat_pct);
  const total = days(g.start_date, g.target_date);
  const t = Math.min(1, Math.max(0, days(g.start_date, date) / Math.max(1, total)));
  return Math.round((g.start_weight + (end - g.start_weight) * t) * 10) / 10;
}

/** 7-day average weight ending on `date` (daily scale noise is ±1 kg; the average is what counts). */
export function rollingAverage(weighIns: WeighIn[], date: string, window = 7): number | null {
  const from = addDays(date, -(window - 1));
  const vals = weighIns.filter((w) => w.date >= from && w.date <= date).map((w) => w.weight_kg);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

/** On track if the 7-day average is within 0.4 kg of the plan (or below it). */
export function goalStatus(g: BodyGoal, weighIns: WeighIn[], date: string): { avg: number; planned: number; diff: number; status: "ahead" | "on-track" | "behind" } | null {
  const avg = rollingAverage(weighIns, date);
  if (avg === null || date < g.start_date) return null;
  const planned = plannedWeight(g, date);
  const diff = Math.round((avg - planned) * 10) / 10;
  return { avg, planned, diff, status: diff <= -0.4 ? "ahead" : diff <= 0.4 ? "on-track" : "behind" };
}

/** Days weighed in during the current Monday–Sunday week. */
export function weighInsThisWeek(weighIns: WeighIn[], date: string): number {
  const dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  const monday = addDays(date, -dow);
  return new Set(weighIns.filter((w) => w.date >= monday && w.date <= date).map((w) => w.date)).size;
}

/** Protein to keep muscle in a deficit: ~2 g per kg body weight, rounded to 5 g. */
export function proteinTarget(weight: number): number {
  return Math.round((weight * 2) / 5) * 5;
}

export interface FuelAdvice {
  headline: string;
  detail: string;
  deficit: boolean;
}

/** Today's fuelling call from the phase and today's training call (push / easy / rest). */
export function fuelAdvice(phase: Phase, call: "push" | "easy" | "rest" | null, raceName?: string, daysTo?: number): FuelAdvice {
  switch (phase) {
    case "race-day":
      return { headline: `Race day${raceName ? `: ${raceName}` : ""} — fuel to perform`, detail: "Carb-rich breakfast 3 h before; a gel or banana 20–30 min before the start. No deficit.", deficit: false };
    case "race-week":
      return {
        headline: `No deficit — ${raceName ?? "race"} in ${daysTo} day${daysTo === 1 ? "" : "s"}`,
        detail: (daysTo ?? 7) <= 2 ? "Top up carbs (about 6–8 g per kg) for the last two days; keep fibre and fat lower." : "Eat at maintenance so you arrive with full glycogen. Dieting now costs more on the course than it saves on the scale.",
        deficit: false,
      };
    case "recover":
      return { headline: "Recover — eat normally", detail: "Two or three days at maintenance with plenty of protein and carbs to repair. The deficit restarts after.", deficit: false };
    case "deficit":
      if (call === "push") return { headline: "Hard day — fuel it", detail: "Eat at maintenance today: carbs before and after the session. Save the deficit for easy and rest days.", deficit: false };
      return {
        headline: call === "rest" ? "Rest day — deficit day" : "Easy day — small deficit",
        detail: "Aim about 400–500 kcal under maintenance, mostly from fewer fats and snacks. Keep carbs around training and protein high.",
        deficit: true,
      };
    default:
      return { headline: "Maintenance", detail: "No goal running. Set a body-fat goal below to get a plan between races.", deficit: false };
  }
}
