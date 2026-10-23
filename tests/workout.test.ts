import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/plan";
import {
  addEntryVolumes,
  bestTemplate,
  benchmarksFromEntries,
  emptyVolumes,
  entryPace,
  ergSessionsFromEntries,
  sanitizeEntries,
  setDistance,
  summarize,
  type Entry,
} from "@/lib/workout";

// Thursday's threshold class: ski + treadmill repeats.
const thresholdClass: Entry[] = [
  { exercise: "ski", sets: 4, distance_m: 500, time_s: 110 },
  { exercise: "treadmill", sets: 4, time_s: 240, speed_kmh: 15, incline_pct: 1 },
];

describe("paces", () => {
  it("gives SkiErg pace per 500 m", () => {
    expect(entryPace(thresholdClass[0])).toBe(110);
  });
  it("gives treadmill pace per km from speed", () => {
    expect(entryPace(thresholdClass[1])).toBe(240); // 15 km/h = 4:00/km
  });
  it("derives treadmill distance from speed × time", () => {
    expect(setDistance(thresholdClass[1])).toBeCloseTo(1000, 5);
  });
});

describe("volumes", () => {
  it("adds up metres across sets", () => {
    const v = addEntryVolumes(emptyVolumes(), [
      ...thresholdClass,
      { exercise: "sled_push", sets: 4, distance_m: 12.5, weight_kg: 152 },
      { exercise: "wall_balls", sets: 3, reps: 20 },
    ]);
    expect(v.skiM).toBe(2000);
    expect(v.runKm).toBeCloseTo(4, 5);
    expect(v.sledM).toBe(50);
    expect(v.wallBalls).toBe(60);
  });
});

describe("analysis integration", () => {
  it("treats a Strava 'HIIT' class with treadmill reps as a run session", () => {
    expect(categorize("HighIntensityIntervalTraining", "Evening HIIT", null, thresholdClass)).toBe("run");
    expect(categorize("HighIntensityIntervalTraining", "Evening HIIT", null, null)).toBe("strength");
  });
  it("lets the session type win", () => {
    expect(categorize("HighIntensityIntervalTraining", "Class", "hyrox", thresholdClass)).toBe("hyrox");
    expect(categorize("Run", "Run", "strength", null)).toBe("strength");
  });
  it("feeds single erg pieces to the HYROX model and flags repeats as intervals", () => {
    const e = ergSessionsFromEntries("2026-10-23", [...thresholdClass, { exercise: "ski", distance_m: 1000, time_s: 225 }], "ski");
    expect(e).toEqual([
      { date: "2026-10-23", distance_m: 500, time_s: 110, intervals: true },
      { date: "2026-10-23", distance_m: 1000, time_s: 225, intervals: false },
    ]);
  });
  it("only uses station efforts of at least half race distance as benchmarks", () => {
    const b = benchmarksFromEntries("2026-10-23", [
      { exercise: "sled_push", sets: 4, distance_m: 12.5, time_s: 20, weight_kg: 152 },
      { exercise: "wall_balls", reps: 50, time_s: 150 },
      { exercise: "treadmill", distance_m: 1000, time_s: 240 },
    ]);
    expect(b).toEqual([{ date: "2026-10-23", station: "wall_balls", time_s: 150, amount: 50, load_kg: null, fresh: false }]);
  });
});

describe("input handling", () => {
  it("drops unknown exercises and bad numbers", () => {
    const e = sanitizeEntries([{ exercise: "ski", sets: "4", distance_m: "abc" }, { exercise: "hack" }, null]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ exercise: "ski", sets: 4, distance_m: null });
  });
  it("summarises a session", () => {
    expect(summarize(thresholdClass)).toBe("4×500 m SkiErg · 4×4:00 Treadmill @ 15 km/h");
  });
});

describe("same as last week", () => {
  const tpl = (over: Partial<import("@/lib/workout").Template>) => ({
    id: "x",
    name: "Evening HIIT",
    sport: "HighIntensityIntervalTraining",
    date: "2026-10-15",
    weekday: 4,
    hour: 18,
    entries: thresholdClass,
    focus: "threshold",
    ...over,
  });
  const target = { id: "t", name: "Evening HIIT", sport: "HighIntensityIntervalTraining", date: "2026-10-22", weekday: 4, hour: 18 };

  it("matches last week's class and prefers the most recent", () => {
    const t = bestTemplate(target, [tpl({ id: "a", date: "2026-10-08" }), tpl({ id: "b", date: "2026-10-15" })]);
    expect(t?.id).toBe("b");
  });
  it("matches by weekday and time when Garmin names differ", () => {
    expect(bestTemplate(target, [tpl({ id: "a", name: "Gym class" })])?.id).toBe("a");
  });
  it("doesn't match an unrelated session", () => {
    expect(bestTemplate(target, [tpl({ id: "a", name: "Strength", sport: "WeightTraining", weekday: 1, hour: 7 })])).toBeNull();
  });
  it("never suggests a later session or one without details", () => {
    expect(bestTemplate(target, [tpl({ id: "a", date: "2026-10-29" }), tpl({ id: "b", entries: [] })])).toBeNull();
  });
});
