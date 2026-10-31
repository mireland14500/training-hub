import type { HyroxEntry } from "@/lib/data";
import { reference, type Division } from "@/lib/hyrox";

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

const SHORT: Record<string, string> = {
  ski: "SkiErg", sled_push: "Sled Push", sled_pull: "Sled Pull", bbj: "Burpee Jumps", row: "Row", farmers: "Farmers", lunges: "Lunges", wall_balls: "Wall Balls",
};

/**
 * Best and worst station: closest to and furthest from a top-15% finisher in the category
 * (as a share of their time, so a 4-minute station and a 1-minute one compare fairly).
 */
export function bestAndWorst(e: HyroxEntry, division: Division) {
  if (!e.stations || e.stations.length < 3) return null;
  const fast = reference(division).fast.stations;
  const ranked = e.stations.map((s) => ({ ...s, name: SHORT[s.key] ?? s.name, ref: fast[s.key], ratio: s.time / fast[s.key] })).sort((a, b) => a.ratio - b.ratio);
  return { best: ranked[0], worst: ranked[ranked.length - 1] };
}
