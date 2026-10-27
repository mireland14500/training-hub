import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSession } from "@/app/actions";
import { FOCUS_LABEL } from "@/components/categories";
import SessionAnalysis from "@/components/SessionAnalysis";
import SessionEditor from "@/components/SessionEditor";
import SimControl from "@/components/SimControl";
import { formatDuration, formatPace } from "@/lib/analysis";
import { getActivity, localDate, sessionAnalysisData, simDivisions, templatesFor } from "@/lib/data";
import { getAthlete } from "@/lib/db";
import { DIVISIONS, SIM_NAME, simKind, type Division } from "@/lib/hyrox";
import { isRun } from "@/lib/strava";

export const dynamic = "force-dynamic";

const SPORT_LABEL: Record<string, string> = {
  HighIntensityIntervalTraining: "HIIT",
  WeightTraining: "Weight training",
  Workout: "Workout",
  Crossfit: "CrossFit",
};

export default async function Session({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getActivity(id);
  if (!a) notFound();
  const [{ templates, suggestedId }, athlete, analysis] = await Promise.all([templatesFor(a), getAthlete(), sessionAnalysisData(a).catch(() => null)]);
  // Offer the sim control on anything that could be one: named like a sim, already marked, or any
  // non-run session when HYROX predictions are on.
  const sim = await simDivisions(a);
  const divisionChoices: [string, string][] = [...new Set<Division>([sim.main, sim.doubles, ...(Object.keys(DIVISIONS) as Division[])])].map((d) => [d, DIVISIONS[d]]);
  const showSim = a.sport !== "HYROX" && (!!a.sim_kind || SIM_NAME.test(a.name ?? "") || (athlete.show_predictions && !isRun(a.sport) && a.sport !== "Ride"));
  const date = localDate(a.start_time);
  const time = new Date(a.start_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: process.env.APP_TIMEZONE || "UTC" });
  const facts = [
    formatDuration(a.moving_s ?? a.duration_s),
    a.distance_m ? `${(a.distance_m / 1000).toFixed(2)} km` : null,
    isRun(a.sport) && a.distance_m ? `${formatPace((a.moving_s ?? a.duration_s) / (a.distance_m / 1000))}/km` : null,
    a.avg_hr ? `${Math.round(a.avg_hr)} bpm avg` : null,
    `load ${Math.round(a.load ?? 0)}`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/calendar?week=${date}`} className="text-sm text-accent">← Week of {date}</Link>
      <div>
        <h1 className="text-2xl font-bold">{a.name}</h1>
        <p className="text-sm text-muted">
          {new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · {time} ·{" "}
          {a.source === "strava" ? `Strava: ${SPORT_LABEL[a.sport] ?? a.sport}` : "Logged here"}
          {a.focus ? ` → ${FOCUS_LABEL[a.focus]}` : ""}
        </p>
        <p className="tabular mt-1 text-sm">{facts.join(" · ")}</p>
        {a.excluded && <p className="mt-1 text-xs text-warn">Merged into another logged session — not counted separately.</p>}
      </div>

      {analysis && <SessionAnalysis data={analysis} distanceM={a.distance_m} movingS={a.moving_s ?? a.duration_s} decoupling={a.decoupling} trainer={a.trainer} />}

      <SessionEditor
        session={{ id: a.id, name: a.name, focus: a.focus, rpe: a.rpe, notes: a.notes, entries: a.entries, photoPath: a.photo_path }}
        templates={templates}
        suggestedId={suggestedId}
      />

      {showSim && (
        <SimControl id={a.id} current={a.sim_kind ?? null} autoKind={simKind(a.name, a.duration_s)} durationS={a.duration_s} simTimeS={a.sim_time_s ?? null} division={sim.current} divisions={divisionChoices} />
      )}

      {a.source !== "strava" && (
        <form action={deleteSession}>
          <input type="hidden" name="id" value={a.id} />
          <button className="w-full py-2 text-sm text-bad">Delete this session</button>
        </form>
      )}
    </div>
  );
}
