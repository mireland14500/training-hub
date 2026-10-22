import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncStrava } from "@/lib/sync";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncStrava();
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
