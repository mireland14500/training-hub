import Link from "next/link";
import SessionEditor from "@/components/SessionEditor";
import { templatesFor, today } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewSession({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/calendar?week=${day}`} className="text-sm text-accent">← Back to calendar</Link>
      <div>
        <h1 className="text-2xl font-bold">Add a session</h1>
        <p className="text-sm text-muted">For a class or workout that isn&apos;t on Strava. If it is on Strava (e.g. as &quot;HIIT&quot;), open it from the calendar instead so it isn&apos;t counted twice.</p>
      </div>
      <SessionEditor session={null} defaultDate={day} templates={(await templatesFor(null)).templates} />
    </div>
  );
}
