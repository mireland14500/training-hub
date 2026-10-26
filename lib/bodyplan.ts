import "server-only";
import { db, type BodyScanRow } from "@/lib/db";
import { daysAgo, today } from "@/lib/data";
import { fuelAdvice, goalStatus, phaseOn, proteinTarget, targetWeight, weighInsThisWeek, type BodyGoal, type Race, type WeighIn } from "@/lib/cut";

/** Races, goal and weigh-ins; each table is optional until schema.sql has been re-run. */
export async function loadBodyPlan(call: "push" | "easy" | "rest" | null) {
  const t = today();
  const [races, goal, weighIns, scans] = await Promise.all([
    db().from("races").select("*").gte("date", daysAgo(3)).order("date"),
    db().from("body_goal").select("*").eq("id", 1).maybeSingle(),
    db().from("weigh_ins").select("date, weight_kg").gte("date", daysAgo(400)).order("date"),
    db().from("body_scans").select("date, weight_kg, body_fat_pct").gte("date", daysAgo(400)).order("date"),
  ]);
  const ready = !races.error && !goal.error && !weighIns.error;
  const raceList = (races.data ?? []) as Race[];
  const g = (goal.data ?? null) as BodyGoal | null;
  if (g) for (const k of ["target_fat_pct", "start_weight", "start_fat_pct"] as const) g[k] = Number(g[k]);

  // InBody scans count as weigh-ins on days without one.
  const manual = ((weighIns.data ?? []) as WeighIn[]).map((w) => ({ date: w.date, weight_kg: Number(w.weight_kg) }));
  const scanRows = (scans.data ?? []) as Pick<BodyScanRow, "date" | "weight_kg" | "body_fat_pct">[];
  const fromScans = scanRows.filter((s) => s.weight_kg != null && !manual.some((m) => m.date === s.date)).map((s) => ({ date: s.date, weight_kg: Number(s.weight_kg) }));
  const all = [...manual, ...fromScans].sort((a, b) => a.date.localeCompare(b.date));

  const latestWeight = all[all.length - 1]?.weight_kg ?? null;
  const latestScan = [...scanRows].reverse().find((s) => s.body_fat_pct != null && s.weight_kg != null) ?? null;
  const p = phaseOn(t, raceList, g);
  const futureRaces = raceList.filter((r) => r.date >= t);

  return {
    ready,
    today: t,
    races: raceList,
    nextRace: futureRaces[0] ?? null,
    goal: g,
    goalWeight: g ? targetWeight(g.start_weight, g.start_fat_pct, g.target_fat_pct) : null,
    weighIns: all,
    weighedToday: manual.some((w) => w.date === t),
    weekCount: weighInsThisWeek(all, t),
    status: g ? goalStatus(g, all, t) : null,
    latestWeight,
    latestScan: latestScan ? { date: latestScan.date, weight: Number(latestScan.weight_kg), fatPct: Number(latestScan.body_fat_pct) } : null,
    phase: p,
    fuel: fuelAdvice(p.phase, call, p.race?.name, p.daysTo),
    protein: latestWeight ? proteinTarget(latestWeight) : null,
  };
}
