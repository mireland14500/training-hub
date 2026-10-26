import Link from "next/link";
import { notFound } from "next/navigation";
import { setRaceTime } from "@/app/actions";
import CarbPlanner from "@/components/CarbPlanner";
import Countdown from "@/components/Countdown";
import { loadBodyPlan } from "@/lib/bodyplan";
import { today } from "@/lib/data";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: race }, plan] = await Promise.all([db().from("races").select("*").eq("id", id).maybeSingle(), loadBodyPlan(null)]);
  if (!race) notFound();
  const dateLabel = new Date(race.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      <Link href="/body" className="text-sm text-accent">← Body</Link>
      <section className="rounded-2xl border border-accent p-4 text-center" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--card))" }}>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{race.name}</div>
        <div className="mt-1">
          <Countdown date={race.date} startTime={race.start_time ?? null} />
        </div>
        <div className="mt-1 text-sm text-muted">
          {dateLabel}
          {race.start_time ? ` · wave ${race.start_time}` : ""}
        </div>
        <form action={setRaceTime} className="mx-auto mt-3 flex max-w-xs items-center gap-2">
          <input type="hidden" name="id" value={race.id} />
          <label className="flex-1 text-left">
            <span className="sr-only">Wave start time</span>
            <input name="start_time" type="time" defaultValue={race.start_time ?? ""} className="input" />
          </label>
          <button className="btn-ghost px-3 text-sm">{race.start_time ? "Update wave" : "Set wave time"}</button>
        </form>
        {!race.start_time && <p className="mt-1 text-xs text-muted">Add your wave time for an exact countdown and breakfast time.</p>}
      </section>

      <h2 className="pt-1 text-lg font-extrabold">Race fuelling</h2>
      <CarbPlanner raceId={race.id} raceDate={race.date} startTime={race.start_time ?? null} weight={plan.latestWeight} today={today()} />
    </div>
  );
}
