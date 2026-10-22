import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/** Redirects to a short-lived signed URL for a stored monitor photo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const { data, error } = await db().storage.from("ski-photos").createSignedUrl(path.join("/"), 600);
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
