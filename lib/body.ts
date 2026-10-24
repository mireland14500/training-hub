import type { BodyScanRow, SegmentalLean } from "@/lib/db";

export type Metric = "weight_kg" | "body_fat_pct" | "skeletal_muscle_kg" | "body_fat_kg";

/** Change in a metric between two scans (latest minus earlier), or null if either is missing. */
export function change(latest: BodyScanRow | undefined, earlier: BodyScanRow | undefined, key: Metric): number | null {
  const a = latest?.[key];
  const b = earlier?.[key];
  return a != null && b != null ? Math.round((Number(a) - Number(b)) * 10) / 10 : null;
}

/** The latest scan at least `days` before the newest one: the baseline for "in the last N days". */
export function scanBefore(scans: BodyScanRow[], days: number): BodyScanRow | undefined {
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last) return undefined;
  const cutoff = new Date(Date.parse(last.date) - days * 86400_000).toISOString().slice(0, 10);
  return [...sorted].reverse().find((s) => s.date <= cutoff);
}

/** Left vs right leg lean mass: % difference relative to the heavier leg (0 = perfectly even). */
export function legImbalance(seg: SegmentalLean | null): { pct: number; stronger: "left" | "right" | null } | null {
  const l = seg?.left_leg;
  const r = seg?.right_leg;
  if (!l || !r) return null;
  const pct = Math.round((Math.abs(l - r) / Math.max(l, r)) * 1000) / 10;
  return { pct, stronger: pct < 0.5 ? null : l > r ? "left" : "right" };
}

/**
 * Rough effect of a fat-mass change on running pace, if fitness stays the same.
 * Running cost and VO2max both scale with body mass, so speed at a given effort ∝ 1 / mass.
 * Returns seconds per km (negative = faster).
 */
export function paceEffectOfFat(weightKg: number, fatChangeKg: number, paceSPerKm: number): number {
  const before = weightKg - fatChangeKg;
  if (before <= 0) return 0;
  return Math.round(paceSPerKm * (weightKg / before - 1));
}
