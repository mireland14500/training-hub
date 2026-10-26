import { describe, expect, it } from "vitest";
import { recoveryStatus, todayCall, type RecoveryDay, type TodayInput } from "@/lib/recovery";
import { paceAtHr, weeklyMedian, windowChange } from "@/lib/running";

function history(today: Partial<RecoveryDay>): RecoveryDay[] {
  const days: RecoveryDay[] = [];
  for (let i = 28; i >= 1; i--) {
    const d = new Date(Date.UTC(2026, 9, 23 - i)).toISOString().slice(0, 10);
    days.push({ date: d, hrv: 60 + (i % 5) - 2, rhr: 48 + (i % 3) - 1, sleep: 80, sleepHours: 7.5, bodyBattery: 70, readiness: 70 });
  }
  days.push({ date: "2026-10-23", hrv: 60, rhr: 48, sleep: 82, sleepHours: 7.8, bodyBattery: 75, readiness: 72, ...today });
  return days;
}

const base = (metrics: ReturnType<typeof recoveryStatus>, over: Partial<TodayInput> = {}): TodayInput => ({
  metrics,
  hasCheckin: true,
  acwr: 1.0,
  hardYesterday: false,
  hardInLast3Days: 0,
  trainedToday: false,
  illNow: false,
  daysSinceTimeOff: null,
  last7: { threshold: false, intervals: false, long: true },
  paces: { easy: "5:10", threshold: "4:05", interval: "3:45" },
  easyHrMax: 150,
  ...over,
});

describe("recovery status", () => {
  it("judges HRV and resting HR against your own baseline", () => {
    const m = recoveryStatus(history({}), "2026-10-23");
    expect(m.find((x) => x.key === "hrv")!.status).toBe("good");
    expect(m.find((x) => x.key === "rhr")!.status).toBe("good");
    const bad = recoveryStatus(history({ hrv: 45, rhr: 55 }), "2026-10-23");
    expect(bad.find((x) => x.key === "hrv")!.status).toBe("low");
    expect(bad.find((x) => x.key === "rhr")!.note).toMatch(/above normal/);
  });
});

describe("today's call", () => {
  it("says push with a threshold session when recovered and none done this week", () => {
    const c = todayCall(base(recoveryStatus(history({}), "2026-10-23")));
    expect(c.call).toBe("push");
    expect(c.session).toMatch(/Threshold: 3 × 10 min at 4:05/);
  });
  it("picks intervals once threshold is done", () => {
    const c = todayCall(base(recoveryStatus(history({}), "2026-10-23"), { last7: { threshold: true, intervals: false, long: true } }));
    expect(c.session).toMatch(/Intervals/);
  });
  it("says easy after a hard day with low HRV", () => {
    const c = todayCall(base(recoveryStatus(history({ hrv: 50 }), "2026-10-23"), { hardYesterday: true }));
    expect(c.call).toBe("easy");
    expect(c.session).toMatch(/Easy run.*5:10.*HR under 150/);
  });
  it("says rest when HRV is low and resting HR is up, or when ill", () => {
    expect(todayCall(base(recoveryStatus(history({ hrv: 42, rhr: 56 }), "2026-10-23"))).call).toBe("rest");
    expect(todayCall(base(recoveryStatus(history({}), "2026-10-23"), { illNow: true })).call).toBe("rest");
  });
});

describe("running progress", () => {
  it("normalises pace to a reference heart rate", () => {
    // 10 km in 50:00 at 150 bpm → at 140 bpm you'd be ~7% slower
    expect(paceAtHr(10000, 3000, 150, 150)).toBeCloseTo(300, 5);
    expect(paceAtHr(10000, 3000, 150, 140)).toBeCloseTo(300 * (150 / 140), 5);
  });
  it("takes weekly medians and compares windows", () => {
    const pts = [
      { date: "2026-09-01", value: 330 },
      { date: "2026-09-08", value: 328 },
      { date: "2026-10-01", value: 320 },
      { date: "2026-10-10", value: 316 },
    ];
    expect(weeklyMedian(pts.slice(0, 2)).length).toBe(2);
    expect(windowChange(pts, "2026-10-23", 28)!.change).toBeCloseTo(318 - 329, 5);
  });
});

describe("race week", () => {
  const m = () => recoveryStatus(history({}), "2026-10-23");
  const race = (daysTo: number) => ({ name: "HYROX Birmingham", daysTo });
  it("tapers instead of suggesting a big session", () => {
    const c = todayCall(base(m(), { race: race(4) }));
    expect(c.headline).toMatch(/Openers/);
    expect(c.session).not.toMatch(/5 × 1 km/);
    expect(todayCall(base(m(), { race: race(2) })).call).toBe("rest");
    expect(todayCall(base(m(), { race: race(1) })).session).toMatch(/Carb load/);
    expect(todayCall(base(m(), { race: race(0) })).headline).toMatch(/Race day/);
    expect(todayCall(base(m(), { race: race(6) })).headline).toMatch(/sharpener/);
  });
  it("ignores races further out", () => {
    expect(todayCall(base(m(), { race: race(10) })).headline).toMatch(/quality session/);
  });
  it("still rests when recovery is red", () => {
    expect(todayCall(base(recoveryStatus(history({ hrv: 42, rhr: 56 }), "2026-10-23"), { race: race(4) })).call).toBe("rest");
  });
});
