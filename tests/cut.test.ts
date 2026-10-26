import { describe, expect, it } from "vitest";
import { fuelAdvice, goalStatus, phaseOn, plannedWeight, proteinTarget, realisticTarget, rollingAverage, suggestedTarget, targetWeight, weeklyRatePct, weighInsThisWeek, type BodyGoal } from "@/lib/cut";

const goal: BodyGoal = { target_fat_pct: 12, start_date: "2026-11-03", target_date: "2027-02-23", start_weight: 80, start_fat_pct: 16 };
const races = [
  { name: "Birmingham", date: "2026-10-30" },
  { name: "Dublin", date: "2027-03-06" },
];

describe("cut planning", () => {
  it("keeps lean mass when computing the target weight", () => {
    // 80 kg at 16% = 67.2 kg lean; at 12% → 76.4 kg
    expect(targetWeight(80, 16, 12)).toBe(76.4);
  });

  it("checks the pace of the goal", () => {
    const r = weeklyRatePct(goal);
    expect(r).toBeGreaterThan(0.25);
    expect(r).toBeLessThan(0.3);
    expect(realisticTarget(goal)).toBeLessThan(12);
  });

  it("never diets in race week", () => {
    expect(phaseOn("2026-10-26", races, goal)).toMatchObject({ phase: "race-week", daysTo: 4 });
    expect(phaseOn("2026-10-30", races, goal).phase).toBe("race-day");
    expect(phaseOn("2026-11-01", races, goal).phase).toBe("recover");
    expect(phaseOn("2026-11-10", races, goal).phase).toBe("deficit");
    expect(phaseOn("2027-03-02", races, goal).phase).toBe("race-week");
    expect(phaseOn("2026-11-10", races, null).phase).toBe("maintain");
  });

  it("tracks against the plan", () => {
    expect(plannedWeight(goal, "2026-11-03")).toBe(80);
    expect(plannedWeight(goal, "2027-02-23")).toBe(76.4);
    const w = [77, 78, 79, 78, 78, 78, 78].map((weight_kg, i) => ({ date: `2026-12-0${i + 1}`, weight_kg }));
    expect(rollingAverage(w, "2026-12-07")).toBe(78);
    // Plan on 7 Dec is 78.9 kg; a 78.0 kg average is ahead.
    expect(goalStatus(goal, w, "2026-12-07")).toMatchObject({ planned: 78.9, status: "ahead" });
    expect(goalStatus(goal, w.map((x) => ({ ...x, weight_kg: x.weight_kg + 1 })), "2026-12-07")?.status).toBe("on-track");
    // 7 Dec 2026 is a Monday: only that day counts in the new week.
    expect(weighInsThisWeek(w, "2026-12-07")).toBe(1);
    expect(weighInsThisWeek(w, "2026-12-06")).toBe(6);
  });

  it("fuels hard days and race weeks", () => {
    expect(fuelAdvice("deficit", "push").deficit).toBe(false);
    expect(fuelAdvice("deficit", "rest").deficit).toBe(true);
    expect(fuelAdvice("race-week", "rest", "Dublin", 2).detail).toMatch(/carbs/);
    expect(proteinTarget(78)).toBe(155);
  });
});

describe("suggested target", () => {
  it("is gentle and never below the lean floor", () => {
    const g = { start_date: "2026-11-03", target_date: "2027-02-27", start_weight: 78.4, start_fat_pct: 14.9 };
    expect(suggestedTarget(g, "male")).toBe(12);
    expect(suggestedTarget({ ...g, start_fat_pct: 11 }, "male")).toBe(10);
    expect(suggestedTarget({ ...g, start_fat_pct: 9 }, "male")).toBe(9);
  });
});
