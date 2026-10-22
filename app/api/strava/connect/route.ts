import { NextResponse } from "next/server";
import { stravaAuthorizeUrl } from "@/lib/strava";

export function GET() {
  return NextResponse.redirect(stravaAuthorizeUrl());
}
