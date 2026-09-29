import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { weeklyReports, type ReportCell, type ReportRow, type WeeklyReport } from "@/lib/db/schema";

/** One row per reporting week (Friday to Thursday). Rows hold the seven Friday columns per client. */

export async function getReport(weekStart: string): Promise<WeeklyReport | null> {
  const db = await getDb();
  const row = await db.query.weeklyReports.findFirst({ where: eq(weeklyReports.weekStart, weekStart), orderBy: [desc(weeklyReports.createdAt)] });
  return row ?? null;
}

export async function getReportById(id: string): Promise<WeeklyReport | null> {
  const db = await getDb();
  const row = await db.query.weeklyReports.findFirst({ where: eq(weeklyReports.id, id) });
  return row ?? null;
}

export async function listReportWeeks(limit = 12): Promise<Pick<WeeklyReport, "id" | "weekStart" | "weekEnd" | "status" | "updatedAt">[]> {
  const db = await getDb();
  return db.query.weeklyReports.findMany({ columns: { id: true, weekStart: true, weekEnd: true, status: true, updatedAt: true }, orderBy: [desc(weeklyReports.weekStart)], limit });
}

/** Creates or replaces the rows for a week. The caller merges hand edits before saving. */
export async function saveReport(weekStart: string, weekEnd: string, rows: ReportRow[], generatedBy: string): Promise<WeeklyReport> {
  const db = await getDb();
  const existing = await getReport(weekStart);
  if (existing) {
    const [row] = await db.update(weeklyReports).set({ rows, generatedBy, weekEnd }).where(eq(weeklyReports.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(weeklyReports).values({ weekStart, weekEnd, rows, generatedBy }).returning();
  return row;
}

/** Saaqib typed into a cell. The value is kept and the cell is marked edited so a regeneration leaves it alone. */
export async function updateReportCell(id: string, clientId: string, key: ReportCell, value: string): Promise<WeeklyReport> {
  const db = await getDb();
  const report = await getReportById(id);
  if (!report) throw new Error("Report not found");
  const rows = report.rows.map((r) => {
    if (r.clientId !== clientId) return r;
    const edited = new Set(r.edited ?? []);
    edited.add(key);
    return { ...r, [key]: value, edited: Array.from(edited) };
  });
  const [row] = await db.update(weeklyReports).set({ rows }).where(eq(weeklyReports.id, id)).returning();
  return row;
}

export async function setReportStatus(id: string, status: "draft" | "final"): Promise<WeeklyReport> {
  const db = await getDb();
  const [row] = await db.update(weeklyReports).set({ status, finalizedAt: status === "final" ? new Date() : null }).where(eq(weeklyReports.id, id)).returning();
  return row;
}
