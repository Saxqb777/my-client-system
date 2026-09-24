import { z } from "zod";
import { asc, eq, gte, inArray } from "drizzle-orm";
import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { parseQuickLog, type ClientContext } from "@/lib/ai/quicklog";
import { aiEnabled } from "@/lib/ai/client";
import { listClients } from "@/lib/data/clients";
import { getDb } from "@/lib/db";
import { milestones } from "@/lib/db/schema";
import { todayISO } from "@/lib/core/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(2, "Write a little more").max(4000) });

export async function POST(req: Request) {
  if (!(await apiPrincipal())) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const db = await getDb();
  const clients = await listClients();
  const upcoming = clients.length
    ? await db.query.milestones.findMany({
        where: inArray(milestones.clientId, clients.map((c) => c.id)),
        orderBy: [asc(milestones.date)],
      })
    : [];
  const today = todayISO();
  const context: ClientContext[] = clients.map((c) => ({
    ...c,
    upcoming: upcoming
      .filter((m) => m.clientId === c.id && m.status === "upcoming" && m.date >= today)
      .map((m) => ({ type: m.type, title: m.title, date: m.date })),
  }));

  const result = await parseQuickLog(parsed.data.text, context);
  return Response.json({ ...result, aiConfigured: aiEnabled() });
}

export const _unused = { eq, gte };
