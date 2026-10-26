import { describe, expect, it } from "vitest";
import { breakfastPlan, countdown, fillMeal, racePlan } from "@/lib/fuel";

describe("race fuelling", () => {
  it("scales the carb load to body weight", () => {
    const plan = racePlan(78, 8, "10:30", 70);
    const d1 = plan.find((s) => s.key === "d1")!;
    expect(d1.carbs).toBe(624);
    const mealTotal = d1.meals!.reduce((a, m) => a + m.total, 0);
    expect(mealTotal).toBeGreaterThan(600);
    expect(mealTotal).toBeLessThan(720);
  });

  it("fits breakfast to the start time", () => {
    expect(breakfastPlan(78, 10)).toMatchObject({ hoursBefore: 3, carbs: 115 });
    expect(breakfastPlan(78, 7)).toMatchObject({ hoursBefore: 2, carbs: 80 });
    expect(racePlan(78, 8, "10:30", 70).find((s) => s.key === "bf")!.when).toContain("07:30");
  });

  it("fills a meal close to its target", () => {
    const m = fillMeal("Lunch", 150, ["rice", "wrap", "drink"]);
    expect(m.total).toBeGreaterThanOrEqual(140);
    expect(m.total).toBeLessThan(200);
  });

  it("counts down", () => {
    expect(countdown(new Date("2026-10-26T08:00:00Z"), new Date("2026-10-30T10:30:00Z"))).toEqual({ days: 4, hours: 2, minutes: 30, past: false });
    expect(countdown(new Date("2026-10-31T08:00:00Z"), new Date("2026-10-30T10:30:00Z")).past).toBe(true);
  });
});
