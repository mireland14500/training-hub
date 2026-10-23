import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readErgMonitor, readHyroxResults, readWorkout, type ImageType } from "@/lib/vision";

export const maxDuration = 60;

const TYPES: ImageType[] = ["image/jpeg", "image/png", "image/webp"];

/** Stores a workout photo and returns the numbers read from it. kind = "erg" | "hyrox" | "workout". */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("photo");
  const kind = ["hyrox", "workout"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "erg";
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo uploaded" }, { status: 400 });
  if (!TYPES.includes(file.type as ImageType)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1];
  const path = `${kind}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db().storage.from("ski-photos").upload(path, bytes, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: `Photo upload failed: ${upErr.message}` }, { status: 500 });

  try {
    const base64 = bytes.toString("base64");
    const type = file.type as ImageType;
    const reading =
      kind === "hyrox" ? await readHyroxResults(base64, type) : kind === "workout" ? await readWorkout(base64, type) : await readErgMonitor(base64, type);
    return NextResponse.json({ photoPath: path, reading });
  } catch (e) {
    // The photo is still saved; the user can type the numbers in.
    return NextResponse.json({ photoPath: path, reading: null, error: (e as Error).message });
  }
}
