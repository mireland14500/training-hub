import { describe, expect, it } from "vitest";
import { buildPlan, goalRunning, nextMonday, pacesFrom5k, phaseOf, weeklyKm, weeksTo, type PlanConfig } from "@/lib/trainingPlan";

const cfg: PlanConfig = {
  start: "2026-11-02",
  weeks: weeksTo("2026-11-02", "2027-03-06"),
  race: { name: "HYROX Dublin", date: "2027-03-06" },
  startKm: 28,
  peakKm: 45,
  runDays: 5,
  goals: { singles: 65 * 60, doubles: 60 * 60 },
};
const paces = pacesFrom5k(21 * 60);

describe("training plan", () => {
  it("dates", () => {
    expect(nextMonday("2026-10-31")).toBe("2026-11-02");
    expect(nextMonday("2026-11-02")).toBe("2026-11-02");
    expect(cfg.weeks).toBe(18);
  });

  it("phases end in a taper and race week", () => {
    const phases = Array.from({ length: cfg.weeks }, (_, i) => phaseOf(i, cfg.weeks, true));
    expect(phases[0]).toBe("Base");
    expect(phases.at(-2)).toBe("Taper");
    expect(phases.at(-1)).toBe("Race week");
    expect(phases).toContain("Build");
    expect(phases).toContain("Specific");
  });

  it("ramps volume safely", () => {
    const km = weeklyKm(cfg);
    expect(km[0]).toBeLessThanOrEqual(31);
    expect(Math.max(...km)).toBe(45);
    // Never more than +10% on the previous full week, and every 4th week lighter.
    for (let i = 1; i < km.length; i++) if ((i + 1) % 4 !== 0 && i < km.length - 2) expect(km[i]).toBeLessThanOrEqual(Math.ceil(Math.max(...km.slice(0, i)) * 1.1) + 1);
    expect(km[3]).toBeLessThan(km[2]);
    expect(km.at(-1)!).toBeLessThan(km.at(-3)!);
  });

  it("builds weeks that add up and stay mostly easy", () => {
    const plan = buildPlan(cfg, paces, { goalKmPace: 280, testFirstWeek: true });
    expect(plan[0].days[1][0].type).toBe("test");
    expect(plan[4].days[1][0].type).toBe("test"); // after the first lighter week
    for (const w of plan.slice(0, -1)) {
      const hard = w.days.flat().filter((s) => s.hard).length;
      expect(hard).toBeLessThanOrEqual(3);
      expect(w.days.flat().filter((s) => s.type === "long").length).toBe(1);
    }
    const peak = plan.find((w) => w.km >= 40)!;
    expect(peak).toBeTruthy();
    expect(plan.at(-1)!.days.flat().some((s) => s.type === "race")).toBe(true);
    expect(plan.some((w) => w.days.flat().some((s) => s.title === "Full sim"))).toBe(true);
    expect(Math.max(...plan.map((w) => w.bikeMin))).toBeGreaterThanOrEqual(100);
  });

  it("works out what a goal needs", () => {
    // 65:00 singles with 30 min of stations + Roxzone and a 15% run penalty.
    const g = goalRunning(65 * 60, 30 * 60, 0.15)!;
    expect(g.kmPace).toBeCloseTo(262.5);
    expect(g.tenKPace).toBeCloseTo(228.3, 0);
    expect(g.fiveK).toBeGreaterThan(17.5 * 60);
    expect(g.fiveK).toBeLessThan(19 * 60);
  });

  it("sets paces from a 5K", () => {
    expect(paces.vdot).toBeGreaterThan(45);
    expect(paces.thresholdS).toBeGreaterThan(250);
    expect(paces.thresholdS).toBeLessThan(270);
  });
});
