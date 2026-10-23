// Running progress from what you actually ran — no race predictions.
// Pure functions — data loading lives in lib/data.ts.

/**
 * Pace you'd run at a reference heart rate, from a run's average speed and HR
 * (speed per heartbeat × reference HR). Comparable across days even when
 * effort varies, so it shows aerobic fitness improving.
 */
export function paceAtHr(distanceM: number, movingS: number, avgHr: number, refHr: number): number {
  const speedPerBeat = distanceM / movingS / avgHr;
  return 1000 / (speedPerBeat * refHr);
}

export interface RunPoint {
  date: string;
  value: number;
}

/** Weekly (Monday) median of points — smooths out single odd runs. */
export function weeklyMedian(points: RunPoint[]): RunPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    const d = new Date(p.date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const w = d.toISOString().slice(0, 10);
    byWeek.set(w, [...(byWeek.get(w) ?? []), p.value]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, vals]) => {
      const s = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return { date, value: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2 };
    });
}

/**
 * Average of the last `days` vs the `days` before that. For paces, negative = faster.
 * Needs at least 2 points in each window.
 */
export function windowChange(points: RunPoint[], today: string, days = 28): { recent: number; previous: number; change: number } | null {
  const cut = shift(today, -days);
  const cut2 = shift(today, -2 * days);
  const recent = points.filter((p) => p.date > cut && p.date <= today).map((p) => p.value);
  const previous = points.filter((p) => p.date > cut2 && p.date <= cut).map((p) => p.value);
  if (recent.length < 2 || previous.length < 2) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { recent: avg(recent), previous: avg(previous), change: avg(recent) - avg(previous) };
}

function shift(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
