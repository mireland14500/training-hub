/**
 * Coach-style analysis of one session's pace and heart rate: what went well, what to watch.
 * Pure functions — the session page feeds them the stream summary and your thresholds.
 */
import { formatPace, hrZone, hrZoneBounds } from "./analysis";
import { STATIONS, type HyroxSplits, type Reference } from "./hyrox";
import type { StreamSummary } from "./streams";

export type Tone = "good" | "warn" | "info";
export interface Insight {
  tone: Tone;
  title: string;
  text: string;
}
export interface Tile {
  label: string;
  value: string;
  sub?: string;
}
export interface Rep {
  n: number;
  start: number;
  time_s: number;
  distance_m: number;
  pace: number;
  hr: number | null;
  maxHr: number | null;
  /** HR fall in the first minute after the rep (bpm). */
  recoveryDrop: number | null;
}

export type RunKind = "easy" | "long" | "recovery" | "threshold" | "intervals" | "race" | "steady";

export interface Thresholds {
  thresholdHr: number;
  maxHr: number | null;
  /** Lactate-threshold speed in m/s (Garmin), if known. */
  ltSpeed: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

/** Rolling mean over `w` bins, ignoring nulls. */
function smooth(xs: (number | null)[], w: number): (number | null)[] {
  return xs.map((_, i) => {
    const win = nums(xs.slice(Math.max(0, i - Math.floor(w / 2)), i + Math.ceil(w / 2)));
    return win.length ? avg(win) : null;
  });
}

/**
 * Work reps from the pace timeline: stretches of ≥ 50 s clearly faster than the run's
 * cruising pace (or near threshold pace). Needs ≥ 2 reps that aren't the whole run.
 */
export function detectReps(s: StreamSummary, ltSpeed: number | null): Rep[] {
  const blocks = workBlocks(s, ltSpeed);
  const workTime = blocks.reduce((a, b) => a + b.time_s, 0);
  return blocks.length >= 2 && workTime <= s.t.length * s.step * 0.75 ? blocks : [];
}

/** Fast stretches of ≥ 50 s (one block for a continuous tempo between warm-up and cool-down). */
export function workBlocks(s: StreamSummary, ltSpeed: number | null): Rep[] {
  const v = smooth(s.speed, Math.max(1, Math.round(20 / s.step)));
  const moving = nums(v).filter((x) => x > 1.5);
  if (moving.length < 10) return [];
  const sorted = [...moving].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  // Work = faster than both the run's median by 12% and (if known) 90% of threshold speed.
  let cut = Math.max(median * 1.12, (median + p90) / 2);
  if (ltSpeed) cut = Math.max(Math.min(cut, ltSpeed * 0.97), ltSpeed * 0.88);

  const minBins = Math.ceil(50 / s.step);
  const gapBins = Math.max(1, Math.floor(15 / s.step));
  const blocks: [number, number][] = [];
  let start = -1;
  let lastFast = -1;
  for (let i = 0; i <= v.length; i++) {
    const fast = i < v.length && (v[i] ?? 0) >= cut;
    if (fast) {
      if (start < 0) start = i;
      lastFast = i;
    } else if (start >= 0 && i - lastFast > gapBins) {
      if (lastFast - start + 1 >= minBins) blocks.push([start, lastFast]);
      start = -1;
    }
  }
  // Smoothing blurs the edges; extend each block while the unsmoothed pace is still on.
  for (const blk of blocks) {
    while (blk[0] > 0 && (s.speed[blk[0] - 1] ?? 0) >= cut * 0.95) blk[0]--;
    while (blk[1] < s.speed.length - 1 && (s.speed[blk[1] + 1] ?? 0) >= cut * 0.95) blk[1]++;
  }
  return blocks.map(([a, b], k) => {
    const sp = nums(s.speed.slice(a, b + 1));
    const time = (b - a + 1) * s.step;
    const dist = avg(sp) * time;
    const hrs = nums(s.hr.slice(a, b + 1));
    const endHr = s.hr[b];
    const after = s.hr[Math.min(s.hr.length - 1, b + Math.round(60 / s.step))];
    return {
      n: k + 1,
      start: s.t[a],
      time_s: time,
      distance_m: Math.round(dist / 10) * 10,
      pace: dist > 0 ? (time / dist) * 1000 : 0,
      hr: hrs.length ? Math.round(avg(hrs)) : null,
      maxHr: hrs.length ? Math.max(...hrs) : null,
      recoveryDrop: endHr != null && after != null && b + Math.round(60 / s.step) < s.hr.length ? endHr - after : null,
    };
  });
}

/** Pace (s/km) and HR over the first and second half of the moving time. */
export function halves(s: StreamSummary) {
  const idx = s.speed.map((v, i) => (v !== null && v > 1.5 ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 6) return null;
  const mid = Math.floor(idx.length / 2);
  const part = (ids: number[]) => {
    const sp = avg(ids.map((i) => s.speed[i]!));
    const hr = nums(ids.map((i) => s.hr[i]));
    return { pace: 1000 / sp, hr: hr.length ? avg(hr) : null };
  };
  return { first: part(idx.slice(0, mid)), second: part(idx.slice(mid)) };
}

/** Share of time per HR zone from the timeline (fallback when zone_seconds is missing). */
export function zoneShares(zoneSeconds: number[] | null, s: StreamSummary | null, thresholdHr: number): number[] | null {
  let z = zoneSeconds;
  if ((!z || !z.some((x) => x > 0)) && s) {
    z = [0, 0, 0, 0, 0];
    for (const h of s.hr) if (h !== null) z[hrZone(h, thresholdHr)] += s.step;
  }
  if (!z) return null;
  const total = z.reduce((a, b) => a + b, 0);
  return total > 0 ? z.map((x) => x / total) : null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (x: number) => `${Math.round(Math.abs(x))} s`;

export interface RunInput {
  kind: RunKind;
  summary: StreamSummary | null;
  distanceM: number;
  movingS: number;
  avgHr: number | null;
  maxHr: number | null;
  zoneSeconds: number[] | null;
  decoupling: number | null;
  trainer: boolean;
  t: Thresholds;
  /** Your typical pace (s/km) at `refHr` from recent easy runs, and this run's equivalent. */
  baseline: { refHr: number; usual: number; thisRun: number | null } | null;
}

export function analyseRun(i: RunInput) {
  const insights: Insight[] = [];
  const pace = i.distanceM > 0 ? i.movingS / (i.distanceM / 1000) : 0;
  const zones = zoneShares(i.zoneSeconds, i.summary, i.t.thresholdHr);
  const bounds = hrZoneBounds(i.t.thresholdHr);
  const reps = i.summary ? detectReps(i.summary, i.t.ltSpeed) : [];
  const h = i.summary ? halves(i.summary) : null;
  const ltPace = i.t.ltSpeed ? 1000 / i.t.ltSpeed : null;
  const kind: RunKind = i.kind === "steady" && reps.length >= 3 ? "intervals" : i.kind;

  const tiles: Tile[] = [
    { label: "Avg pace", value: `${formatPace(pace)}/km`, sub: i.trainer ? "treadmill — distance is estimated" : ltPace ? `threshold ${formatPace(ltPace)}` : undefined },
    { label: "Avg HR", value: i.avgHr ? `${Math.round(i.avgHr)}` : "–", sub: i.avgHr ? `${pct(i.avgHr / i.t.thresholdHr)} of threshold HR` : undefined },
    { label: "Max HR", value: i.maxHr ? `${Math.round(i.maxHr)}` : "–", sub: i.t.maxHr && i.maxHr ? `${pct(i.maxHr / i.t.maxHr)} of max` : undefined },
  ];

  // 1. Did the session do its job?
  if (zones && (kind === "easy" || kind === "long" || kind === "recovery")) {
    const easyShare = zones[0] + zones[1];
    const cap = bounds[1].max!;
    if (easyShare >= 0.8) insights.push({ tone: "good", title: "Easy done right", text: `${pct(easyShare)} of the run in zones 1–2 (under ${cap} bpm). This is what builds your aerobic engine without costing recovery.` });
    else
      insights.push({
        tone: "warn",
        title: "Too hard for an easy run",
        text: `Only ${pct(easyShare)} in zones 1–2 and ${pct(zones[2] + zones[3] + zones[4])} above ${cap} bpm. Slow down${i.baseline ? ` to around ${formatPace(i.baseline.usual)}/km` : ""} — easy days that drift into tempo blunt your hard days.`,
      });
  }
  if (kind === "threshold" && ltPace && i.summary) {
    // Reps, or the continuous tempo block, or (no clear block) the whole run.
    const blocks = reps.length ? reps : workBlocks(i.summary, i.t.ltSpeed).filter((b) => b.time_s >= 300);
    const workTime = blocks.reduce((a, b) => a + b.time_s, 0);
    const work = blocks.length ? blocks.reduce((a, b) => a + b.pace * b.time_s, 0) / workTime : pace;
    const diff = work - ltPace;
    const where = reps.length ? `Reps averaged ${formatPace(work)}/km` : blocks.length ? `The ${Math.round(workTime / 60)}-min tempo block averaged ${formatPace(work)}/km` : `You averaged ${formatPace(work)}/km`;
    if (Math.abs(diff) <= ltPace * 0.03) insights.push({ tone: "good", title: "Right on threshold", text: `${where}, within 3% of your threshold pace (${formatPace(ltPace)}). Exactly the stimulus that moves your threshold.` });
    else if (diff < 0)
      insights.push({ tone: "warn", title: "Faster than threshold", text: `${where}, ${secs(diff)}/km quicker than threshold (${formatPace(ltPace)}). That drifts into VO2 work: harder to recover from, and not more effective for threshold.` });
    else insights.push({ tone: "info", title: "Under threshold", text: `${where}, ${secs(diff)}/km slower than threshold (${formatPace(ltPace)}). Fine on a tired day; otherwise you have room to push.` });
  }
  if (reps.length >= 2) {
    const first = reps[0].pace;
    const last = reps[reps.length - 1].pace;
    const spread = Math.max(...reps.map((r) => r.pace)) - Math.min(...reps.map((r) => r.pace));
    const fade = last - first;
    if (fade > 8) insights.push({ tone: "warn", title: "Reps faded", text: `Last rep ${secs(fade)}/km slower than the first. Start the first one or two a touch slower so the set stays even.` });
    else if (spread <= 6) insights.push({ tone: "good", title: "Even reps", text: `All ${reps.length} reps within ${secs(spread)}/km of each other — well-judged pacing.` });
    else if (fade < -4) insights.push({ tone: "good", title: "Strong finish", text: `Last rep ${secs(fade)}/km faster than the first.` });
    const drops = nums(reps.map((r) => r.recoveryDrop));
    if (drops.length >= 2) {
      const d = avg(drops);
      insights.push({
        tone: d >= 25 ? "good" : "info",
        title: "Heart-rate recovery",
        text: `HR fell ${Math.round(d)} bpm in the first minute after each rep on average${d >= 25 ? " — a sign of good aerobic fitness." : ". This rises as fitness improves; worth watching over the coming weeks."}`,
      });
    }
  }

  // 2. Pacing across the run (not for interval sessions, where halves mean little).
  if (h && reps.length < 2 && kind !== "recovery") {
    const d = h.second.pace - h.first.pace;
    const rel = d / h.first.pace;
    if (rel <= -0.01) insights.push({ tone: "good", title: "Negative split", text: `Second half ${secs(d)}/km faster than the first. Great control.` });
    else if (rel > 0.03 && kind !== "easy")
      insights.push({ tone: "warn", title: "Positive split", text: `Second half ${secs(d)}/km slower than the first (${formatPace(h.first.pace)} → ${formatPace(h.second.pace)}). Hold back early — the first km is the cheapest place to lose time.` });
  }

  // 3. Cardiac drift on steady efforts.
  if (i.decoupling !== null && reps.length < 2 && i.movingS >= 40 * 60) {
    const dc = i.decoupling;
    if (dc < 5) insights.push({ tone: "good", title: "Aerobically solid", text: `Pace-to-HR drift only ${dc.toFixed(1)}% from first to second half. Your aerobic base held up for the whole run.` });
    else
      insights.push({
        tone: dc > 8 ? "warn" : "info",
        title: "Heart rate drifted",
        text: `Pace-to-HR drift ${dc.toFixed(1)}%${h?.first.hr && h.second.hr ? ` (HR ${Math.round(h.first.hr)} → ${Math.round(h.second.hr)} bpm)` : ""}. Heat, dehydration, under-fuelling or a pace above your aerobic limit all do this. Under 5% is the target for long runs.`,
      });
  }

  // 4. Versus your own baseline at the same heart rate.
  if (i.baseline?.thisRun && (kind === "easy" || kind === "long" || kind === "steady") && !i.trainer) {
    const d = i.baseline.thisRun - i.baseline.usual;
    if (Math.abs(d) >= 4)
      insights.push({
        tone: d < 0 ? "good" : "info",
        title: d < 0 ? "Fitter than usual" : "Slower than usual for the effort",
        text: `At ${i.baseline.refHr} bpm this run works out to ${formatPace(i.baseline.thisRun)}/km — ${secs(d)}/km ${d < 0 ? "faster" : "slower"} than your recent typical ${formatPace(i.baseline.usual)}/km.${d > 0 ? " Often fatigue, heat, hills or a poor night's sleep; one run means little, a trend means a lot." : ""}`,
      });
  }

  if (i.t.maxHr && i.maxHr && i.maxHr > i.t.maxHr + 1)
    insights.push({ tone: "info", title: "New max heart rate", text: `${Math.round(i.maxHr)} bpm is above the ${i.t.maxHr} in Settings. If it wasn't a strap glitch, update it so your zones stay right.` });

  return { tiles, insights, reps, zones, halves: h };
}

/** Segment order of a HYROX: run, station, run, station… */
export const SEGMENTS = STATIONS.flatMap((st, i) => [{ key: `run${i + 1}`, name: `Run ${i + 1}`, run: true }, { key: st.key, name: st.name.replace(/ \d.*$/, ""), run: false }]);

export interface HyroxInput {
  summary: StreamSummary | null;
  avgHr: number | null;
  maxHr: number | null;
  zoneSeconds: number[] | null;
  durationS: number;
  t: Thresholds;
  splits: HyroxSplits | null;
  reference: { average: Reference; fast: Reference } | null;
  /** Open 10K pace (s/km) now, to measure compromised running. */
  tenKPace: number | null;
}

export function analyseHyrox(i: HyroxInput) {
  const insights: Insight[] = [];
  const zones = zoneShares(i.zoneSeconds, i.summary, i.t.thresholdHr);
  const hrs = i.summary ? nums(i.summary.hr) : [];
  const tiles: Tile[] = [
    { label: "Avg HR", value: i.avgHr ? `${Math.round(i.avgHr)}` : hrs.length ? `${Math.round(avg(hrs))}` : "–", sub: i.avgHr ? `${pct(i.avgHr / i.t.thresholdHr)} of threshold HR` : undefined },
    { label: "Max HR", value: i.maxHr ? `${Math.round(i.maxHr)}` : hrs.length ? `${Math.max(...hrs)}` : "–", sub: i.t.maxHr && i.maxHr ? `${pct(i.maxHr / i.t.maxHr)} of max` : undefined },
    { label: "Above threshold", value: zones ? pct(zones[4]) : "–", sub: zones ? `+ ${pct(zones[3])} at threshold` : undefined },
  ];

  if (zones) {
    const hard = zones[3] + zones[4];
    insights.push({
      tone: "info",
      title: "Intensity",
      text: `${pct(hard)} of the session at or above threshold HR (${i.t.thresholdHr} bpm)${zones[4] > 0.5 ? " — a true race effort." : hard > 0.3 ? " — solid race-specific work." : ". More of a steady session than a race effort."}`,
    });
  }
  if (hrs.length >= 8) {
    const mid = Math.floor(hrs.length / 2);
    const a = avg(hrs.slice(0, mid));
    const b = avg(hrs.slice(mid));
    const d = Math.round(b - a);
    if (d >= 6) insights.push({ tone: "info", title: "HR climbed through the session", text: `Second-half HR averaged ${d} bpm higher (${Math.round(a)} → ${Math.round(b)}). Normal as fatigue builds; a big rise usually means the early runs were too quick.` });
    else if (d <= -5)
      insights.push({ tone: "warn", title: "HR dropped late on", text: `Second-half HR ${-d} bpm lower than the first (${Math.round(a)} → ${Math.round(b)}). When HR falls while you're working flat out, legs or grip are usually the limit, not your engine — think sleds, lunges and wall balls.` });
    else insights.push({ tone: "good", title: "Even effort", text: `HR held steady from first half to second (${Math.round(a)} → ${Math.round(b)} bpm) — well-controlled pacing.` });
  }

  // Logged splits: run fade and where the time went.
  let segments: { name: string; time: number; ref: number | null; run: boolean }[] = [];
  const runs = (i.splits?.runs ?? []).filter((r): r is number => !!r && r > 0);
  if (i.splits && runs.length >= 4) {
    const firstHalf = avg(runs.slice(0, Math.floor(runs.length / 2)));
    const secondHalf = avg(runs.slice(Math.floor(runs.length / 2)));
    const fade = secondHalf - firstHalf;
    insights.push({
      tone: fade > 15 ? "warn" : "good",
      title: fade > 15 ? "Runs faded" : "Runs held up",
      text: `Runs ${runs.length > 4 ? "5–8" : "in the second half"} averaged ${formatPace(secondHalf)}/km vs ${formatPace(firstHalf)}/km early on (${fade >= 0 ? "+" : "−"}${secs(fade)}).${fade > 15 ? " Compromised-running sessions (run straight off sleds and wall balls) target exactly this." : ""}`,
    });
    if (i.tenKPace) {
      const all = avg(runs);
      const pen = all / i.tenKPace - 1;
      insights.push({ tone: "info", title: "Compromised running", text: `Your HYROX kms averaged ${formatPace(all)}/km: ${pct(pen)} slower than your open 10K pace (${formatPace(i.tenKPace)}). Good HYROX runners keep this near 10–15%.` });
    }
    segments = SEGMENTS.map((sg, k) => {
      const runIdx = Math.floor(k / 2);
      const time = sg.run ? (i.splits!.runs[runIdx] ?? 0) : (i.splits!.stations[sg.key as keyof HyroxSplits["stations"]] ?? 0);
      const ref = i.reference ? (sg.run ? i.reference.fast.run : i.reference.fast.stations[sg.key as keyof Reference["stations"]]) : null;
      return { name: sg.name, time: time ?? 0, ref, run: sg.run };
    }).filter((s) => s.time > 0);
    const losses = segments.filter((s) => !s.run && s.ref).map((s) => ({ ...s, gap: s.time - s.ref! })).sort((a, b) => b.gap - a.gap);
    if (losses[0] && losses[0].gap > 15)
      insights.push({ tone: "info", title: "Biggest station gap", text: `${losses[0].name}: ${secs(losses[0].gap)} slower than a top-15% time${losses[1] && losses[1].gap > 15 ? `, then ${losses[1].name} (${secs(losses[1].gap)})` : ""}. That's where the easiest time is.` });
  }

  return { tiles, insights, zones, segments };
}
