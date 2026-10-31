import type { HyroxEntry } from "@/lib/data";

/**
 * Everything that wasn't running — stations plus Roxzone — so every result compares the same way,
 * whether it has full splits or just an average run pace.
 */
export function stationTime(e: HyroxEntry): { time: number } | null {
  const runs = e.runs ? e.runs.reduce((a, b) => a + b, 0) : e.runAvg ? e.runAvg * 8 : null;
  return runs !== null ? { time: Math.max(0, e.total - runs) } : null;
}

/** "+13 s" / "−4 s" against threshold. */
export function vsThreshold(pace: number, threshold: number) {
  const d = Math.round(pace - threshold);
  return d === 0 ? "at threshold" : `${d > 0 ? "+" : "−"}${Math.abs(d)} s`;
}
