import { describe, expect, it } from "vitest";
import { benchmarkToRace, bestErg1k, erg1kEquivalent, opportunities, predictHyrox, REFERENCE, type PredictionInput } from "@/lib/hyrox";

const base: PredictionInput = {
  division: "open_men",
  asOf: "2026-10-01",
  tenKPace: null,
  skiSessions: [],
  rowSessions: [],
  benchmarks: [],
  hyroxSessions: [],
};

describe("erg conversions", () => {
  it("leaves a 1000 m piece unchanged", () => {
    expect(erg1kEquivalent(1000, 230)).toBeCloseTo(230, 5);
  });
  it("makes a 2000 m piece's 1 km equivalent faster by 5 s/500 m", () => {
    // 2 km in 8:00 = 2:00/500 m → 1 km at 1:55/500 m = 3:50.
    expect(erg1kEquivalent(2000, 480)).toBeCloseTo(230, 5);
  });
  it("ignores interval sessions", () => {
    expect(bestErg1k([{ date: "2026-09-01", distance_m: 4000, time_s: 800, intervals: true }])).toBeNull();
  });
});

describe("benchmark scaling", () => {
  it("scales a lighter, shorter sled push up to race standard", () => {
    // 25 m at 76 kg in 60 s → 50 m at 152 kg ≈ 60 × 2.08 × 2 × 1.1 (race fatigue)
    const t = benchmarkToRace({ date: "2026-09-01", station: "sled_push", time_s: 60, amount: 25, load_kg: 76, fresh: true }, "open_men");
    expect(t).toBeGreaterThan(270);
    expect(t).toBeLessThan(280);
  });
  it("does not add race fatigue to efforts done straight after running", () => {
    const t = benchmarkToRace({ date: "2026-09-01", station: "wall_balls", time_s: 300, amount: null, load_kg: null, fresh: false }, "open_men");
    expect(t).toBe(300);
  });
});

describe("prediction", () => {
  it("falls back to the division reference with no data", () => {
    const p = predictHyrox(base);
    const ref = REFERENCE.open_men.average;
    const expected = ref.run * 8 + ref.roxzone + Object.values(ref.stations).reduce((a, b) => a + b, 0);
    expect(p.total).toBeCloseTo(expected, 5);
    expect(p.confidence).toBe(0);
  });

  it("uses running fitness for the runs", () => {
    const p = predictHyrox({ ...base, tenKPace: 270 }); // 45:00 10K
    const runs = p.segments.find((s) => s.key === "runs")!;
    expect(runs.time).toBeCloseTo(270 * 1.12 * 8, 5);
    expect(runs.source).toBe("running fitness");
  });

  it("measures the run penalty from a sim and prefers recent evidence", () => {
    const p = predictHyrox({
      ...base,
      tenKPace: 270,
      benchmarks: [{ date: "2026-08-01", station: "wall_balls", time_s: 400, amount: null, load_kg: null, fresh: true }],
      hyroxSessions: [
        {
          date: "2026-09-15",
          tenKPaceAtTime: 270,
          splits: { kind: "full_sim", runs: Array(8).fill(324), stations: { wall_balls: 330 }, roxzone_s: 400 },
        },
      ],
    });
    expect(p.runPenalty).toBeCloseTo(0.2, 5); // 324 / 270 − 1
    const wb = p.segments.find((s) => s.key === "wall_balls")!;
    expect(wb.time).toBe(330); // the sim is newer than the benchmark
    expect(wb.source).toBe("race/sim");
    expect(p.segments.find((s) => s.key === "roxzone")!.time).toBe(400);
  });

  it("uses an older race for segments with no recent data", () => {
    const malaga = {
      date: "2026-04-12",
      tenKPaceAtTime: 230,
      splits: {
        kind: "race" as const,
        runs: Array(8).fill(262),
        stations: { ski: 250, sled_push: 160, sled_pull: 230, bbj: 220, row: 255, farmers: 95, lunges: 220, wall_balls: 280 },
        roxzone_s: 330,
      },
    };
    const p = predictHyrox({ ...base, asOf: "2026-10-23", tenKPace: 230, hyroxSessions: [malaga] });
    const wb = p.segments.find((s) => s.key === "wall_balls")!;
    expect(wb.time).toBe(280);
    expect(wb.stale).toBe(true);
    expect(wb.detail).toMatch(/race 2026-04-12 \(6 months ago\)/);
    expect(p.runPenalty).toBeCloseTo(262 / 230 - 1, 5);
    // Same fitness as on race day → reproduces the race: 8 × 262 + stations + roxzone.
    expect(p.total).toBeCloseTo(8 * 262 + 1710 + 330, 5);
    expect(p.confidence).toBe(1);
  });

  it("ignores data older than the window", () => {
    const p = predictHyrox({ ...base, benchmarks: [{ date: "2025-01-01", station: "row", time_s: 200, amount: null, load_kg: null, fresh: true }] });
    expect(p.segments.find((s) => s.key === "row")!.source).toBe("reference");
  });

  it("ranks the biggest time losses first", () => {
    const p = predictHyrox({ ...base, benchmarks: [{ date: "2026-09-01", station: "wall_balls", time_s: 900, amount: null, load_kg: null, fresh: false }] });
    expect(opportunities(p, 1)[0].key).toBe("wall_balls");
  });
});
