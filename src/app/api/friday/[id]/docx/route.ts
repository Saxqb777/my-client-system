import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { getReportById } from "@/lib/data/reports";
import { buildFridayDocx } from "@/lib/docs/fridayDocx";

export const runtime = "nodejs";

const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The Friday pack for one week as a Word file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await apiPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const report = await getReportById(id);
  if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
  const file = await buildFridayDocx({ weekStart: report.weekStart, weekEnd: report.weekEnd, rows: report.rows, status: report.status });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": WORD, "Content-Disposition": `attachment; filename="Friday_pack_${report.weekStart}.docx"`, "Cache-Control": "private, no-store" },
  });
}
