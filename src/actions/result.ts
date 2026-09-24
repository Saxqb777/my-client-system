export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: unknown): ActionResult<T> {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong";
  return { ok: false, error: message };
}

export function zodMessage(issues: { message: string; path: PropertyKey[] }[]): string {
  const first = issues[0];
  if (!first) return "Invalid input";
  const path = first.path.length ? `${String(first.path[first.path.length - 1])}: ` : "";
  return `${path}${first.message}`;
}
