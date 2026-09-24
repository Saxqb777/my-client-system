import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, bearerToken, safeEqual, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    if (pathname === "/login") {
      const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
      if (ok) return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");

  if (pathname.startsWith("/api/cron/")) {
    const token = bearerToken(request.headers.get("authorization"));
    const expected = process.env.CRON_SECRET;
    if (token && expected && (await safeEqual(token, expected))) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionOk = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (sessionOk) return NextResponse.next();

  if (isApi) {
    const token = bearerToken(request.headers.get("authorization"));
    const expected = process.env.ORBIT_API_TOKEN;
    if (token && expected && (await safeEqual(token, expected))) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  const next = pathname + search;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)",
  ],
};
