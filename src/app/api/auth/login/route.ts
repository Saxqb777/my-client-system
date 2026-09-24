import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1).max(200) });

// Small in-memory throttle per instance. Not perfect on serverless, but it slows blind guessing.
const attempts = new Map<string, { count: number; until: number }>();

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const state = attempts.get(key);
  const now = Date.now();
  if (state && state.until > now) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  }

  const expected = process.env.ORBIT_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "ORBIT_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  const ok = await safeEqual(parsed.data.password, expected);
  if (!ok) {
    const count = (state?.count ?? 0) + 1;
    const until = count >= 5 ? now + 60_000 : 0;
    attempts.set(key, { count: until ? 0 : count, until });
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  attempts.delete(key);
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
