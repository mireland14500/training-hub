// Recovery status from Garmin numbers vs your own baseline, and today's Push / Easy / Rest call.
// Pure functions — data loading lives in lib/data.ts.

export interface RecoveryDay {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep: number | null;
  sleepHours: number | null;
  bodyBattery: number | null;
  readiness: number | null; // Garmin Training Readiness
}

export interface Baseline {
  mean: number;
  sd: number;
  n: number;
}

/** Mean and spread of a metric over the 28 days before `date` (needs at least 5 values). */
export function baseline(days: RecoveryDay[], date: string, key: keyof Omit<RecoveryDay, "date">, minSd: number): Baseline | null {
  const from = shift(date, -28);
  const vals = days.filter((d) => d.date >= from && d.date < date).map((d) => d[key]).filter((v): v is number => typeof v === "number");
  if (vals.length < 5) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return { mean, sd: Math.max(sd, minSd), n: vals.length };
}

export type Status = "good" | "ok" | "low";

export interface MetricStatus {
  key: "hrv" | "rhr" | "sleep" | "bodyBattery" | "readiness";
  label: string;
  today: number | null;
  /** Normal range from your last 4 weeks, when there's enough data. */
  range: [number, number] | null;
  status: Status | null;
  note: string;
  series: { date: string; value: number | null }[];
}

/** HRV, resting HR, sleep, Body Battery and Garmin readiness for today, each judged against you. */
export function recoveryStatus(days: RecoveryDay[], today: string): MetricStatus[] {
  const t = days.find((d) => d.date === today) ?? null;
  const last14 = Array.from({ length: 14 }, (_, i) => shift(today, i - 13));
  const series = (k: keyof Omit<RecoveryDay, "date">) => last14.map((date) => ({ date: date.slice(5), value: days.find((d) => d.date === date)?.[k] ?? null }));
  const out: MetricStatus[] = [];

  // HRV: like Garmin's HRV status — the 7-day average against your normal range.
  const hb = baseline(days, today, "hrv", 2);
  const hrv7vals = days.filter((d) => d.date > shift(today, -7) && d.date <= today && d.hrv).map((d) => d.hrv!);
  const hrv7 = hrv7vals.length ? hrv7vals.reduce((a, b) => a + b, 0) / hrv7vals.length : null;
  let hrvStatus: Status | null = null;
  let hrvNote = hb ? "" : "Building your baseline (needs ~5 nights)";
  if (hb && t?.hrv != null) {
    if (t.hrv < hb.mean - 1.5 * hb.sd) [hrvStatus, hrvNote] = ["low", `Well below your normal (${Math.round(hb.mean)})`];
    else if (hrv7 !== null && hrv7 < hb.mean - hb.sd) [hrvStatus, hrvNote] = ["low", "7-day average below your normal range"];
    else if (t.hrv < hb.mean - 0.75 * hb.sd) [hrvStatus, hrvNote] = ["ok", "A little below normal"];
    else [hrvStatus, hrvNote] = ["good", "Within your normal range"];
  }
  out.push({ key: "hrv", label: "HRV (ms)", today: t?.hrv ?? null, range: hb ? [Math.round(hb.mean - hb.sd), Math.round(hb.mean + hb.sd)] : null, status: hrvStatus, note: hrvNote, series: series("hrv") });

  // Resting HR: a rise of 4–5+ bpm over your norm is a classic fatigue/illness sign.
  const rb = baseline(days, today, "rhr", 1);
  let rhrStatus: Status | null = null;
  let rhrNote = rb ? "" : "Building your baseline";
  if (rb && t?.rhr != null) {
    const diff = t.rhr - rb.mean;
    if (diff >= 5) [rhrStatus, rhrNote] = ["low", `${Math.round(diff)} bpm above normal`];
    else if (diff >= 3) [rhrStatus, rhrNote] = ["ok", `${Math.round(diff)} bpm above normal`];
    else [rhrStatus, rhrNote] = ["good", "Normal"];
  }
  out.push({ key: "rhr", label: "Resting HR", today: t?.rhr ?? null, range: rb ? [Math.round(rb.mean - rb.sd), Math.round(rb.mean + rb.sd)] : null, status: rhrStatus, note: rhrNote, series: series("rhr") });

  const absolute = (key: "sleep" | "bodyBattery" | "readiness", label: string, low: number, ok: number, unitNote = "") => {
    const v = t?.[key] ?? null;
    const status: Status | null = v == null ? null : v < low ? "low" : v < ok ? "ok" : "good";
    const note = v == null ? "" : status === "low" ? "Low" : status === "ok" ? "Fair" : "Good";
    out.push({ key, label, today: v, range: null, status, note: note + unitNote, series: series(key) });
  };
  absolute("sleep", "Sleep score", 60, 75, t?.sleepHours ? ` · ${t.sleepHours} h` : "");
  absolute("bodyBattery", "Body Battery", 30, 60);
  absolute("readiness", "Garmin readiness", 33, 66);
  return out;
}

export type Call = "push" | "easy" | "rest";

export interface TodayInput {
  metrics: MetricStatus[];
  hasCheckin: boolean;
  acwr: number | null;
  hardYesterday: boolean;
  hardInLast3Days: number;
  trainedToday: boolean;
  illNow: boolean;
  daysSinceTimeOff: number | null;
  last7: { threshold: boolean; intervals: boolean; long: boolean };
  paces: { easy: string; threshold: string; interval: string } | null;
  easyHrMax: number | null;
  /** Next race within a week: the call becomes a taper. */
  race?: { name: string; daysTo: number } | null;
}

export interface TodayCall {
  call: Call;
  headline: string;
  reasons: string[];
  session: string;
}

/** Push (quality session), Easy, or Rest — from recovery signals, load and recent hard days. */
export function todayCall(i: TodayInput): TodayCall {
  const get = (k: MetricStatus["key"]) => i.metrics.find((m) => m.key === k);
  const red: string[] = [];
  const amber: string[] = [];

  if (i.illNow) red.push("You're marked as ill");
  const hrv = get("hrv");
  const rhr = get("rhr");
  if (hrv?.status === "low" && rhr?.status === "low") red.push(`HRV low and resting HR up (${rhr.note})`);
  else {
    if (hrv?.status === "low") amber.push(`HRV: ${hrv.note.toLowerCase()}`);
    if (rhr?.status === "low") amber.push(`Resting HR ${rhr.note}`);
  }
  const bb = get("bodyBattery");
  if (bb?.today != null && bb.today < 20) red.push(`Body Battery only ${bb.today}`);
  else if (bb?.status === "low") amber.push(`Body Battery ${bb.today}`);
  const rd = get("readiness");
  if (rd?.today != null && rd.today < 20) red.push(`Garmin readiness ${rd.today}`);
  else if (rd?.status === "low") amber.push(`Garmin readiness ${rd.today}`);
  const sl = get("sleep");
  if (sl?.status === "low") amber.push(`Poor sleep (${sl.today})`);
  if (i.acwr !== null && i.acwr > 1.3) amber.push(`This week's load is ${i.acwr}× your usual`);
  if (i.hardYesterday) amber.push("Hard session yesterday");
  if (i.hardInLast3Days >= 2) amber.push(`${i.hardInLast3Days} hard sessions in the last 3 days`);
  if (i.daysSinceTimeOff !== null && i.daysSinceTimeOff <= 5) amber.push("First days back after time off");

  const p = i.paces;
  const easySession = `Easy run 30–50 min${p ? ` at ${p.easy}/km` : ""}${i.easyHrMax ? `, HR under ${i.easyHrMax}` : ""} — or strength/mobility`;

  if (i.trainedToday) {
    return { call: red.length ? "rest" : amber.length ? "easy" : "push", headline: "You've trained today ✓", reasons: [...red, ...amber], session: "Recover well: eat, hydrate, sleep 8 h. Check back tomorrow." };
  }
  if (red.length) return { call: "rest", headline: "Rest today", reasons: red.concat(amber), session: "Rest, or a 20–30 min walk. Training through this slows your progress." };

  // Race week: freshness beats fitness now — nothing you do this week makes you fitter by race day.
  const r = i.race;
  if (r && r.daysTo >= 0 && r.daysTo <= 6) {
    const why = [`${r.name} ${r.daysTo === 0 ? "today" : `in ${r.daysTo} day${r.daysTo === 1 ? "" : "s"}`} — taper`, ...amber];
    if (r.daysTo === 0)
      return { call: "push", headline: "Race day — go get it", reasons: why, session: "Warm-up: 10 min easy jog, dynamic mobility, 3 × 20 s strides and a few wall balls / burpees 15 min before your wave." };
    if (r.daysTo === 1) return { call: "easy", headline: "Day before — stay fresh", reasons: why, session: "Rest, or 15–20 min easy jog with 4 × 20 s strides. Carb load today." };
    if (r.daysTo === 2) return { call: "rest", headline: "Rest day", reasons: why, session: "Full rest or a 20–30 min walk. Let the legs fill up." };
    if (r.daysTo <= 4 && !amber.length)
      return { call: "push", headline: "Openers — short and sharp", reasons: why, session: `20 min easy + 3 × 3 min${p ? ` at ${p.threshold}/km` : " at threshold"}, 2 min jog between, + 4 strides. Finish feeling you could do more.` };
    if (!amber.length)
      return { call: "push", headline: "Last sharpener", reasons: why, session: `2 × 10 min${p ? ` at ${p.threshold}/km` : " at threshold"} with 3 min easy — no longer. No heavy sleds or new exercises this week.` };
    return { call: "easy", headline: "Easy — protect the taper", reasons: why, session: `Easy 25–35 min${p ? ` at ${p.easy}/km` : ""}. Skip anything hard this week.` };
  }
  if (amber.length >= 2 || (amber.length === 1 && (hrv?.status === "low" || i.hardYesterday))) {
    return { call: "easy", headline: "Keep it easy today", reasons: amber, session: easySession };
  }

  // Ready for quality. Pick what the week is missing, threshold first (biggest payoff for running speed).
  let session: string;
  if (!i.last7.threshold) session = `Threshold: 3 × 10 min${p ? ` at ${p.threshold}/km` : ""}, 2 min easy jog between`;
  else if (!i.last7.intervals) session = `Intervals: 5 × 1 km${p ? ` at ${p.interval}/km` : ""}, 2 min jog recoveries`;
  else if (!i.last7.long) session = `Long run 75–90 min${p ? ` at ${p.easy}/km` : ""}, fully conversational`;
  else session = `You've done your key sessions this week — an easy run${p ? ` at ${p.easy}/km` : ""} keeps volume up without adding fatigue`;
  const reasons = amber.length ? amber : [i.hasCheckin ? "Recovery numbers are in your normal range" : "No recovery data today — run npm run garmin for a better call"];
  return { call: "push", headline: i.last7.threshold && i.last7.intervals && i.last7.long ? "Recovered — easy volume today" : "Good to go — quality session", reasons, session };
}

function shift(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
