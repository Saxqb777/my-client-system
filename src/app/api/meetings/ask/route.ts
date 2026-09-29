import { z } from "zod";
import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { askOrbit } from "@/lib/ai/ask";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(1000), clientId: z.string().uuid().nullable().optional() });

/** POST /api/meetings/ask. A question answered from meeting history with sources. */
export async function POST(req: Request) {
  if (!(await apiPrincipal())) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question of at least three characters" }, { status: 400 });
  const result = await askOrbit(parsed.data.question, parsed.data.clientId ?? null);
  return Response.json(result);
}
