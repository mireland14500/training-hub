/**
 * Compact pace + heart-rate timeline for one activity, built from Strava streams at sync time
 * (a few hundred points instead of thousands). Pure functions.
 */

export interface StreamSummary {
  v: 1;
  /** Seconds per bin. */
  step: number;
  /** Elapsed seconds at the start of each bin. */
  t: number[];
  /** Average heart rate in each bin (null = no data or paused). */
  hr: (number | null)[];
  /** Speed in m/s in each bin (null = no distance, or stopped). */
  speed: (number | null)[];
  /** Per-km splits for runs with distance. */
  splits: { km: number; distance_m: number; time_s: number; hr: number | null }[];
}

const MAX_SPEED = 7; // m/s — anything faster on foot is a GPS jump

export function summarizeStreams(time: number[], distance: number[], hr: number[], targetPoints = 600): StreamSummary | null {
  const n = time.length;
  if (n < 10) return null;
  const total = time[n - 1] - time[0];
  if (total <= 0) return null;
  const step = Math.max(5, Math.ceil(total / targetPoints / 5) * 5);
  const hasDist = distance.length === n && distance[n - 1] > 200;
  const hasHr = hr.length === n && hr.some((h) => h > 0);

  // GPS-spike-clipped cumulative distance.
  const dist: number[] = [];
  if (hasDist) {
    dist.push(distance[0] ?? 0);
    for (let i = 1; i < n; i++) {
      const dt = Math.max(0, time[i] - time[i - 1]);
      dist.push(dist[i - 1] + Math.min(Math.max(0, distance[i] - distance[i - 1]), dt * MAX_SPEED));
    }
  }

  const bins = Math.ceil(total / step);
  const t: number[] = [];
  const hrOut: (number | null)[] = [];
  const speedOut: (number | null)[] = [];
  let i = 0;
  for (let b = 0; b < bins; b++) {
    const from = time[0] + b * step;
    const to = from + step;
    let hrSum = 0;
    let hrN = 0;
    const startIdx = i;
    while (i < n && time[i] < to) {
      if (hasHr && hr[i] > 0) {
        hrSum += hr[i];
        hrN++;
      }
      i++;
    }
    t.push(b * step);
    hrOut.push(hrN ? Math.round(hrSum / hrN) : null);
    if (hasDist && i > startIdx) {
      const a = Math.max(0, startIdx - 1);
      const z = i - 1;
      const dt = time[z] - time[a];
      const v = dt > 0 ? (dist[z] - dist[a]) / dt : 0;
      speedOut.push(v > 0.5 ? Math.round(v * 100) / 100 : null);
    } else speedOut.push(null);
  }

  // Km splits: time to cover each full km (and the remainder if ≥ 200 m).
  const splits: StreamSummary["splits"] = [];
  if (hasDist) {
    let km = 1;
    let lastIdx = 0;
    const end = dist[n - 1];
    const close = (idx: number, d: number) => {
      let s = 0;
      let c = 0;
      if (hasHr) for (let k = lastIdx; k <= idx; k++) if (hr[k] > 0) (s += hr[k]), c++;
      splits.push({ km, distance_m: Math.round(d), time_s: Math.round(time[idx] - time[lastIdx]), hr: c ? Math.round(s / c) : null });
      lastIdx = idx;
    };
    for (let k = 1; k < n; k++) {
      if (dist[k] >= km * 1000) {
        close(k, 1000);
        km++;
      }
    }
    const rest = end - (km - 1) * 1000;
    if (rest >= 200) close(n - 1, rest);
  }

  return { v: 1, step, t, hr: hrOut, speed: speedOut, splits };
}
