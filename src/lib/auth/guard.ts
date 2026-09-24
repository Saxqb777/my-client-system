import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, bearerToken, safeEqual, verifySessionToken } from "./session";

export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Server component / server action guard. Redirects to login when signed out. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}

export type ApiPrincipal = { kind: "session" } | { kind: "token" };

/** Route handler guard. Accepts the session cookie or the ORBIT_API_TOKEN bearer token. */
export async function apiPrincipal(): Promise<ApiPrincipal | null> {
  if (await hasSession()) return { kind: "session" };
  const auth = (await headers()).get("authorization");
  const token = bearerToken(auth);
  const expected = process.env.ORBIT_API_TOKEN;
  if (token && expected && (await safeEqual(token, expected))) return { kind: "token" };
  return null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
