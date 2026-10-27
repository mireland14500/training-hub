import { describe, expect, it } from "vitest";
import { summarizeStreams } from "@/lib/streams";
import { analyseHyrox, analyseRun, detectReps } from "@/lib/sessionAnalysis";

/** Builds 1 Hz streams from [seconds, speed m/s, hr] segments. */
function streams(segs: [number, number, number][]) {
  const time: number[] = [];
  const dist: number[] = [];
  const hr: number[] = [];
  let t = 0;
  let d = 0;
  for (const [dur, v, h] of segs)
    for (let k = 0; k < dur; k++) {
      time.push(t++);
      d += v;
      dist.push(d);
      hr.push(h);
    }
  return { time, dist, hr };
}

const t = { thresholdHr: 170, maxHr: 192, ltSpeed: 1000 / 245 };

describe("stream summary", () => {
  it("bins the timeline and makes km splits", () => {
    const s = streams([[1800, 1000 / 330, 140]]);
    const sum = summarizeStreams(s.time, s.dist, s.hr)!;
    expect(sum.t.length).toBeLessThanOrEqual(600);
    // 5.45 km: five full kms plus the last 454 m.
    expect(sum.splits.length).toBe(6);
    expect(sum.splits[5].distance_m).toBeGreaterThan(440);
    expect(sum.splits[0].time_s).toBeGreaterThan(325);
    expect(sum.splits[0].time_s).toBeLessThan(335);
    expect(sum.splits[0].hr).toBe(140);
  });
});

describe("run analysis", () => {
  it("praises a truly easy run", () => {
    const s = streams([[2700, 1000 / 330, 140]]);
    const r = analyseRun({ kind: "easy", summary: summarizeStreams(s.time, s.dist, s.hr), distanceM: s.dist.at(-1)!, movingS: 2700, avgHr: 140, maxHr: 146, zoneSeconds: null, decoupling: 2, trainer: false, t, baseline: { refHr: 145, usual: 335, thisRun: 318 } });
    const titles = r.insights.map((x) => x.title);
    expect(titles).toContain("Easy done right");
    expect(titles).toContain("Aerobically solid");
    expect(titles).toContain("Fitter than usual");
  });

  it("flags an easy run done too hard", () => {
    const s = streams([[2400, 1000 / 290, 162]]);
    const r = analyseRun({ kind: "easy", summary: summarizeStreams(s.time, s.dist, s.hr), distanceM: s.dist.at(-1)!, movingS: 2400, avgHr: 162, maxHr: 168, zoneSeconds: null, decoupling: 9, trainer: false, t, baseline: null });
    expect(r.insights.map((x) => x.title)).toEqual(expect.arrayContaining(["Too hard for an easy run", "Heart rate drifted"]));
  });

  it("finds interval reps and their HR recovery", () => {
    const segs: [number, number, number][] = [[600, 1000 / 340, 135]];
    for (let k = 0; k < 6; k++) segs.push([180, 1000 / 226, 172], [120, 1000 / 400, 140]);
    const s = streams(segs);
    const sum = summarizeStreams(s.time, s.dist, s.hr)!;
    const reps = detectReps(sum, t.ltSpeed);
    expect(reps.length).toBe(6);
    expect(reps[0].pace).toBeGreaterThan(215);
    expect(reps[0].pace).toBeLessThan(240);
    expect(reps[0].recoveryDrop).toBeGreaterThanOrEqual(25);
    const r = analyseRun({ kind: "intervals", summary: sum, distanceM: s.dist.at(-1)!, movingS: s.time.length, avgHr: 155, maxHr: 175, zoneSeconds: null, decoupling: null, trainer: false, t, baseline: null });
    expect(r.insights.map((x) => x.title)).toEqual(expect.arrayContaining(["Even reps", "Heart-rate recovery"]));
  });

  it("checks threshold pace", () => {
    const s = streams([[600, 1000 / 340, 135], [1800, 1000 / 225, 168], [600, 1000 / 360, 140]]);
    const r = analyseRun({ kind: "threshold", summary: summarizeStreams(s.time, s.dist, s.hr), distanceM: s.dist.at(-1)!, movingS: 3000, avgHr: 160, maxHr: 172, zoneSeconds: null, decoupling: null, trainer: false, t, baseline: null });
    expect(r.insights.map((x) => x.title)).toContain("Faster than threshold");
  });
});

describe("HYROX analysis", () => {
  it("reads intensity, late HR drop and run fade", () => {
    const s = streams([[2000, 0, 176], [2000, 0, 166]]);
    const r = analyseHyrox({
      summary: summarizeStreams(s.time, [], s.hr),
      avgHr: 171, maxHr: 182, zoneSeconds: null, durationS: 4000, t,
      splits: { kind: "race", runs: [270, 275, 280, 285, 295, 300, 305, 310], stations: { ski: 250, sled_push: 200, sled_pull: 260, bbj: 280, row: 270, farmers: 110, lunges: 260, wall_balls: 330 }, roxzone_s: 400 },
      reference: null,
      tenKPace: 240,
    });
    const titles = r.insights.map((x) => x.title);
    expect(titles).toEqual(expect.arrayContaining(["Intensity", "HR dropped late on", "Runs faded", "Compromised running"]));
    expect(r.segments.length).toBe(16);
  });
});
