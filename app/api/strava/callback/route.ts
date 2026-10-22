import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code || req.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/settings?strava=denied", req.url));
  }
  await exchangeCode(code);
  return NextResponse.redirect(new URL("/settings?strava=connected", req.url));
}
