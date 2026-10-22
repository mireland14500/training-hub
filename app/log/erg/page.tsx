import ErgForm from "@/components/ErgForm";
import { linkCandidates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LogErg({ searchParams }: { searchParams: Promise<{ machine?: string }> }) {
  const { machine } = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Log erg session</h1>
      <ErgForm candidates={await linkCandidates()} initialMachine={machine ?? "SkiErg"} />
    </div>
  );
}
