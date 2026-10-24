import { describe, expect, it } from "vitest";
import { change, legImbalance, paceEffectOfFat, scanBefore } from "@/lib/body";
import type { BodyScanRow } from "@/lib/db";

const scan = (date: string, weight: number, fat: number): BodyScanRow => ({
  id: date, date, weight_kg: weight, body_fat_pct: fat, body_fat_kg: null, skeletal_muscle_kg: null, lean_mass_kg: null,
  total_body_water_l: null, visceral_fat_level: null, bmr_kcal: null, inbody_score: null, segmental_lean: null, photo_path: null, notes: null,
});

describe("body scans", () => {
  const scans = [scan("2026-06-01", 80, 16), scan("2026-08-15", 78.6, 14.2), scan("2026-10-01", 78, 13.5)];

  it("finds the baseline scan for a window", () => {
    expect(scanBefore(scans, 30)?.date).toBe("2026-08-15");
    expect(scanBefore(scans, 90)?.date).toBe("2026-06-01");
    expect(scanBefore(scans, 365)).toBeUndefined();
  });

  it("computes changes", () => {
    expect(change(scans[2], scans[0], "weight_kg")).toBe(-2);
    expect(change(scans[2], scans[0], "skeletal_muscle_kg")).toBeNull();
  });

  it("measures leg imbalance", () => {
    expect(legImbalance({ left_leg: 10, right_leg: 10.4, left_arm: null, right_arm: null, trunk: null })).toEqual({ pct: 3.8, stronger: "right" });
    expect(legImbalance({ left_leg: 10, right_leg: 10.02, left_arm: null, right_arm: null, trunk: null })?.stronger).toBeNull();
    expect(legImbalance(null)).toBeNull();
  });

  it("estimates pace effect of losing fat", () => {
    // 2 kg of fat off a 78 kg runner at 4:00/km ≈ 6 s/km faster
    expect(paceEffectOfFat(78, -2, 240)).toBe(-6);
    expect(paceEffectOfFat(78, 0, 240)).toBe(0);
  });
});
