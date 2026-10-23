import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, passwordMatches, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Tell a misconfigured deployment apart from a wrong password.
  if (!process.env.APP_PASSWORD?.trim()) return NextResponse.redirect(new URL("/login?error=no-password", req.url), 303);
  if (!process.env.SESSION_SECRET?.trim()) return NextResponse.redirect(new URL("/login?error=no-secret", req.url), 303);
  const form = await req.formData();
  if (!passwordMatches(String(form.get("password") ?? ""))) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}
