import { NextResponse, after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { deleteStravaActivity, syncOneActivity } from "@/lib/sync";

export const maxDuration = 60;

// Strava calls this once when you register the subscription.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": p.get("hub.challenge") });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

interface StravaEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
}

// Strava expects a 200 within 2 seconds, so the work happens after responding.
export async function POST(req: NextRequest) {
  const event = (await req.json()) as StravaEvent;
  const { data: auth } = await db().from("strava_auth").select("athlete_id").eq("id", 1).maybeSingle();
  if (event.object_type === "activity" && auth?.athlete_id === event.owner_id) {
    after(async () => {
      try {
        if (event.aspect_type === "delete") await deleteStravaActivity(event.object_id);
        else await syncOneActivity(event.object_id);
        revalidatePath("/", "layout");
      } catch (e) {
        console.error("Strava webhook processing failed", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
