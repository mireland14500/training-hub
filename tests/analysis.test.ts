import { describe, expect, it } from "vitest";
import {
  acwr,
  bestEfforts,
  criticalSpeed,
  formatPace,
  hrLoad,
  pace500FromWatts,
  pmc,
  predictTime,
  readiness,
  sessionLoad,
  speedForVo2,
  trainingPaces,
  vdotFromPerformance,
  wattsFromPace500,
  zoneSeconds,
} from "@/lib/analysis";

const athlete = { sex: "male" as const, max_hr: 190, resting_hr: 50, threshold_hr: 170 };

describe("load", () => {
  it("scores one hour at threshold HR as 100", () => {
    expect(hrLoad(3600, 170, athlete)).toBeCloseTo(100, 5);
  });
  it("scores easy work far lower than threshold work", () => {
    expect(hrLoad(3600, 135, athlete)).toBeLessThan(50);
  });
  it("falls back from HR to RPE to duration", () => {
    expect(sessionLoad({ duration_s: 3600, avg_hr: 170 }, athlete).method).toBe("hr");
    expect(sessionLoad({ duration_s: 3600, rpe: 7 }, athlete)).toEqual({ load: 100, method: "rpe" });
    expect(sessionLoad({ duration_s: 3600 }, athlete).method).toBe("duration");
  });
});

describe("pmc", () => {
  it("builds fitness slowly and fatigue quickly", () => {
    const loads = new Map<string, number>();
    for (let d = 1; d <= 28; d++) loads.set(`2026-01-${String(d).padStart(2, "0")}`, 100);
    const s = pmc(loads, "2026-01-01", "2026-01-28");
    const last = s[s.length - 1];
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.tsb).toBeLessThan(0);
    expect(acwr(s)).toBeCloseTo(1, 1);
  });
});

describe("running", () => {
  it("matches Daniels' VDOT tables (20:00 5K ≈ VDOT 49.8)", () => {
    expect(vdotFromPerformance(5000, 1200)).toBeCloseTo(49.8, 0);
  });
  it("round-trips VDOT predictions", () => {
    const t = predictTime(50, 10000);
    expect(vdotFromPerformance(10000, t)).toBeCloseTo(50, 1);
    expect(t).toBeGreaterThan(40 * 60);
    expect(t).toBeLessThan(43 * 60);
  });
  it("orders training paces from slow to fast", () => {
    const p = trainingPaces(50);
    const easy = p.find((z) => z.name === "Easy")!;
    const threshold = p.find((z) => z.name === "Threshold")!;
    const interval = p.find((z) => z.name === "Interval")!;
    expect(easy.range[0]).toBeGreaterThan(threshold.range[1]);
    expect(threshold.range[0]).toBeGreaterThan(interval.range[1]);
    // VDOT 50 threshold ≈ 4:15/km in Daniels' tables.
    expect((threshold.range[0] + threshold.range[1]) / 2).toBeGreaterThan(245);
    expect((threshold.range[0] + threshold.range[1]) / 2).toBeLessThan(265);
  });
  it("inverts the oxygen cost curve", () => {
    const v = speedForVo2(45);
    const vMin = v * 60;
    expect(-4.6 + 0.182258 * vMin + 0.000104 * vMin * vMin).toBeCloseTo(45, 5);
  });
  it("finds best efforts with a surge in the middle", () => {
    const time: number[] = [];
    const dist: number[] = [];
    let d = 0;
    for (let t = 0; t <= 3600; t++) {
      time.push(t);
      dist.push(d);
      d += t >= 1000 && t < 1360 ? 5 : 3; // 6 minutes at 5 m/s
    }
    const e = bestEfforts(time, dist, [360, 720]);
    expect(e["360"]).toBeCloseTo(1800, 0);
    expect(e["720"]).toBeCloseTo(1800 + 360 * 3, 0);
  });
  it("recovers critical speed from a known model", () => {
    const cs = 4.2;
    const dPrime = 200;
    const efforts = Object.fromEntries([180, 360, 720, 1200].map((t) => [String(t), cs * t + dPrime]));
    expect(criticalSpeed(efforts)).toEqual({ cs: 4.2, dPrime: 200 });
  });
  it("formats paces", () => {
    expect(formatPace(255)).toBe("4:15");
    expect(formatPace(299.6)).toBe("5:00");
  });
});

describe("zones & readiness", () => {
  it("splits time into HR zones", () => {
    const z = zoneSeconds([0, 1, 2, 3], [120, 150, 165, 175], 170);
    expect(z).toEqual([0, 1, 0, 1, 1]); // 150 → Z2, 165 → Z4, 175 → Z5
  });
  it("penalises low HRV and high soreness", () => {
    const hist = Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, hrv_ms: 60, resting_hr: 48 }));
    const good = readiness(5, { date: "2026-01-20", hrv_ms: 65, resting_hr: 47, soreness: 1, energy: 5 }, hist);
    const bad = readiness(-25, { date: "2026-01-20", hrv_ms: 45, resting_hr: 55, soreness: 5, energy: 1 }, hist);
    expect(good.score).toBeGreaterThan(75);
    expect(bad.score).toBeLessThan(35);
    expect(bad.label).toBe("Recover");
  });
});

describe("skierg", () => {
  it("converts between watts and /500m pace (Concept2)", () => {
    expect(pace500FromWatts(wattsFromPace500(120))).toBeCloseTo(120, 5);
    expect(wattsFromPace500(120)).toBeCloseTo(202.5, 0); // 2:00/500m ≈ 203 W
  });
});
