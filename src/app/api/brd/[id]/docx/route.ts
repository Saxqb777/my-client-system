import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { projectLabel } from "@/lib/core/minutes";
import { getDraft, listBrdItems, meetingReadCounts, sourceLabel } from "@/lib/data/brd";
import { buildBrdDocx } from "@/lib/docs/brdDocx";

export const runtime = "nodejs";

const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** One BRD draft as a Word file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await apiPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const draft = await getDraft(id);
  if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
  const [items, counts] = await Promise.all([listBrdItems(draft.clientId), meetingReadCounts(draft.clientId)]);
  const file = await buildBrdDocx({
    clientCode: draft.client.code,
    clientName: draft.client.name,
    project: projectLabel({ name: draft.client.name, system: draft.client.system }),
    version: draft.version,
    date: draft.createdAt,
    meetingsRead: counts.read,
    sections: draft.sections,
    sources: new Map(items.map((i) => [i.id, sourceLabel(i)])),
  });
  const name = `${draft.client.code}_BRD_draft_v${draft.version}.docx`;
  return new Response(new Uint8Array(file), { headers: { "Content-Type": WORD, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
