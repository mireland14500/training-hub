import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { applyGarminLoadsIfNeeded } from "@/lib/sync";
import { GarminNotConnectedError, syncGarmin } from "@/lib/garmin";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncGarmin();
    await applyGarminLoadsIfNeeded();
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, notConnected: e instanceof GarminNotConnectedError }, { status: e instanceof GarminNotConnectedError ? 409 : 500 });
  }
}
