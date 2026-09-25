/**
 * Runs the demo seed against an in memory PGlite database and prints INSERT statements
 * so the same demo data can be applied to Neon through the Neon connector when the sandbox
 * cannot reach the database directly.
 */
process.env.DATABASE_URL = "pglite://memory";

import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { seedDemoData } from "../src/lib/demo/seed";

const TABLES = ["clients", "people", "milestones", "activities", "tasks", "settings"] as const;

const JSONB_COLUMNS = new Set(["date_history", "attendees", "action_items", "value", "rows", "summary"]);
const TEXT_ARRAY_COLUMNS = new Set(["aliases", "tags"]);

function lit(v: unknown, col?: string): string {
  if (v === null || v === undefined) return "NULL";
  if (col && JSONB_COLUMNS.has(col)) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (col && TEXT_ARRAY_COLUMNS.has(col)) return `ARRAY[${(v as unknown[]).map((x) => lit(x)).join(",")}]::text[]`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) return `ARRAY[${v.map((x) => lit(x)).join(",")}]::text[]`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  await seedDemoData();
  const db = await getDb();
  const out: string[] = [];
  for (const table of TABLES) {
    const res = await db.execute(sql.raw(`select * from ${table}`));
    const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[]);
    for (const row of rows) {
      const entries = Object.entries(row).filter(([k]) => k !== "search_vector");
      const cols = entries.map(([k]) => `"${k}"`).join(",");
      const vals = entries.map(([k, v]) => lit(v, k)).join(",");
      const conflict = table === "settings" ? ` ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"` : table === "clients" ? ` ON CONFLICT ("code") DO NOTHING` : "";
      out.push(`INSERT INTO ${table} (${cols}) VALUES (${vals})${conflict}`);
    }
  }
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
