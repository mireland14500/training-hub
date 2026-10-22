import SkiForm from "@/components/SkiForm";
import { formatDuration } from "@/lib/analysis";
import { db } from "@/lib/db";
import { localDate } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewSki() {
  // Recent Garmin/Strava recordings that could be this SkiErg session (no GPS distance).
  const { data } = await db()
    .from("activities")
    .select("id, name, sport, start_time, duration_s, avg_hr, distance_m")
    .eq("source", "strava")
    .eq("excluded", false)
    .gte("start_time", new Date(Date.now() - 3 * 86400000).toISOString())
    .order("start_time", { ascending: false });
  const candidates = (data ?? [])
    .filter((a) => !a.distance_m || /ski|workout|row|cardio/i.test(a.sport))
    .map((a) => ({
      id: a.id,
      label: `${localDate(a.start_time)} · ${a.name} · ${formatDuration(a.duration_s)}${a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}`,
    }));
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Log SkiErg session</h1>
      <SkiForm candidates={candidates} />
    </div>
  );
}
