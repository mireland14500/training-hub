import HyroxForm from "@/components/HyroxForm";
import { getAthlete } from "@/lib/db";
import { linkCandidates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LogHyrox() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Log HYROX sim or race</h1>
        <p className="text-sm text-muted">Your splits are the strongest evidence for your predicted time — especially the run splits, which show how much the stations slow your running.</p>
      </div>
      <HyroxForm candidates={await linkCandidates()} defaultDivision={(await getAthlete()).hyrox_division} />
    </div>
  );
}
