import { helperPrincipal, unauthorized } from "@/lib/auth/guard";
import { listVocabulary } from "@/lib/data/vocabulary";

export const runtime = "nodejs";

/** GET /api/v1/vocabulary. The terms the Mac helper feeds to the transcriber so names come out right. */
export async function GET() {
  if (!(await helperPrincipal())) return unauthorized();
  const rows = await listVocabulary();
  return Response.json(
    { terms: rows.map((r) => ({ term: r.term, type: r.type, meaning: r.meaning })), prompt: rows.map((r) => r.term).join(", ") },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
