import { describe, expect, it } from "vitest";
import { pmc } from "@/lib/analysis";
import { categorize, weeklyPlan, type PlanInput, type SessionSummary } from "@/lib/plan";

function input(dailyLoad: (i: number) => number, overrides: Partial<PlanInput> = {}): PlanInput {
  const loads = new Map<string, number>();
  const sessions: SessionSummary[] = [];
  for (let i = 0; i < 120; i++) {
    const d = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
    const l = dailyLoad(i);
    loads.set(d, l);
    if (l > 0) sessions.push({ date: d, category: i % 3 === 0 ? "strength" : "run", load: l, durationS: 3600, hard: l > 90, quality: i % 7 === 2 });
  }
  const series = pmc(loads, "2026-06-01", "2026-09-28");
  const last28 = series.slice(-28).map((p) => p.load);
  const acwr = last28.slice(-7).reduce((a, b) => a + b, 0) / (last28.reduce((a, b) => a + b, 0) / 4);
  return {
    today: "2026-09-28",
    pmc: series,
    acwr: Math.round(acwr * 100) / 100,
    readinessToday: 75,
    readinessRecent: [72, 75],
    hardShare: 0.15,
    sessions: sessions.filter((s) => s.date >= "2026-08-24"),
    daysToGoal: null,
    thresholdPace: "4:10",
    weakStations: ["Wall Balls"],
    ...overrides,
  };
}

describe("weekly plan", () => {
  it("tapers in the last 10 days before the race", () => {
    expect(weeklyPlan(input(() => 60, { daysToGoal: 6 })).verdict).toBe("taper");
  });

  it("calls for a deload after a big load spike", () => {
    const p = weeklyPlan(input((i) => (i >= 113 ? 200 : 50)));
    expect(p.verdict).toBe("deload");
    expect(p.target.high).toBeLessThan(p.weekSoFar + 1000);
  });

  it("suggests adding a session when load has dropped and you're fresh", () => {
    const p = weeklyPlan(input((i) => (i >= 113 ? 20 : 70)));
    expect(p.verdict).toBe("add");
    expect(p.suggestions[0].action).toBe("add");
  });

  it("holds when training is steady", () => {
    const p = weeklyPlan(input(() => 60));
    expect(p.verdict).toBe("maintain");
  });

  it("reduces when readiness has been low", () => {
    expect(weeklyPlan(input(() => 60, { readinessRecent: [50, 52, 48] })).verdict).toBe("reduce");
  });

  it("recommends HYROX-specific work when none was done", () => {
    const p = weeklyPlan(input((i) => (i >= 113 ? 20 : 70)));
    expect(p.suggestions[0].session).toMatch(/Compromised running/);
    expect(p.mix.find((m) => m.label.startsWith("HYROX"))!.status).toBe("low");
  });
});

describe("categorize", () => {
  it("recognises HYROX sessions from Garmin activity names", () => {
    expect(categorize("Workout", "HYROX sim")).toBe("hyrox");
    expect(categorize("WeightTraining", "Wall balls + sled")).toBe("hyrox");
    expect(categorize("WeightTraining", "Lower body")).toBe("strength");
    expect(categorize("Run", "Morning Run")).toBe("run");
    expect(categorize("RowErg", null)).toBe("erg");
  });
});
