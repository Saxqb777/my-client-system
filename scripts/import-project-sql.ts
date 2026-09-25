/**
 * Converts project export JSON files into SQL statements for the Neon connector.
 * Usage: tsx scripts/import-project-sql.ts <outDir> <file.json>=<CODE>=<clientId> ...
 * Each client gets one or more JSON files with an array of statements: update client, wipe its rows, insert the new ones.
 */
import fs from "node:fs";
import path from "node:path";
import { projectExportSchema } from "../src/lib/import/schema";
import { mapProject } from "../src/lib/import/mapProject";
import { todayISO } from "../src/lib/core/dates";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
const textArr = (a: string[]) => `ARRAY[${a.map((x) => lit(x)).join(",")}]::text[]`;
const jsonb = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || specs.length === 0) {
  console.error("usage: tsx scripts/import-project-sql.ts <outDir> <file.json>=<CODE>=<clientId> ...");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const today = todayISO();

for (const spec of specs) {
  const [file, code, clientId] = spec.split("=");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = projectExportSchema.parse(raw);
  const m = mapProject(parsed, today, code);
  const cid = lit(clientId);

  const head: string[] = [];
  head.push(
    `UPDATE clients SET name=${lit(m.client.name)}, code=${lit(m.client.code)}, full_name=${lit(m.client.fullName)}, system=${lit(m.client.system)}, aliases=${textArr(m.client.aliases)}, owner=${lit(m.client.owner)}, phase=${lit(m.client.phase)}, health=${lit(m.client.health)}, next_step=${lit(m.client.nextStep)}, phase_start_date=${lit(m.client.phaseStartDate)}, phase_target_date=${lit(m.client.phaseTargetDate)}, phase_target_original=${lit(m.client.phaseTargetOriginal)}, notes=${lit(m.client.notes)}, demo_status=false, archived_at=NULL, updated_at=now() WHERE id=${cid}`,
  );
  for (const t of ["tasks", "activities", "milestones", "people", "meetings", "documents"]) head.push(`DELETE FROM ${t} WHERE client_id=${cid}`);
  for (const p of m.people) head.push(`INSERT INTO people (client_id,name,role,side,email,phone,is_primary,notes,is_demo) VALUES (${cid},${lit(p.name)},${lit(p.role)},${lit(p.side)},${lit(p.email)},${lit(p.phone)},${lit(p.isPrimary)},${lit(p.notes)},false)`);
  for (const ms of m.milestones) head.push(`INSERT INTO milestones (client_id,title,type,date,original_date,date_history,status,completed_at,notes,is_demo) VALUES (${cid},${lit(ms.title)},${lit(ms.type)},${lit(ms.date)},${lit(ms.originalDate)},${jsonb(ms.dateHistory)},${lit(ms.status)},${lit(ms.completedAt)},${lit(ms.notes)},false)`);
  for (const t of m.tasks) head.push(`INSERT INTO tasks (client_id,title,details,status,priority,due_date,waiting_on,waiting_since,completed_at,is_demo) VALUES (${cid},${lit(t.title)},${lit(t.details)},${lit(t.status)},${lit(t.priority)},${lit(t.dueDate)},${lit(t.waitingOn)},${lit(t.waitingSince)},${lit(t.completedAt)},false)`);

  const tail: string[] = [];
  for (const a of m.activities) tail.push(`INSERT INTO activities (client_id,type,title,body,occurred_at,source,tags,is_demo) VALUES (${cid},${lit(a.type)},${lit(a.title)},${lit(a.body)},${lit(a.occurredAt)},'paste',${textArr(a.tags)},false)`);
  for (const mt of m.meetings) tail.push(`INSERT INTO meetings (client_id,title,held_at,attendees,mom,action_items,is_demo) VALUES (${cid},${lit(mt.title)},${lit(mt.heldAt)},${jsonb(mt.attendees)},${lit(mt.mom)},${jsonb(mt.actionItems)},false)`);
  for (const d of m.documents) tail.push(`INSERT INTO documents (client_id,type,title,content,tags,is_demo) VALUES (${cid},${lit(d.type)},${lit(d.title)},${lit(d.content)},${textArr(d.tags)},false)`);

  const base = path.basename(file, ".json");
  fs.writeFileSync(path.join(outDir, `${base}-1.json`), JSON.stringify(head));
  fs.writeFileSync(path.join(outDir, `${base}-2.json`), JSON.stringify(tail));
  const size = (s: string[]) => JSON.stringify(s).length;
  console.log(`${base}: ${m.client.code} people ${m.people.length}, milestones ${m.milestones.length}, tasks ${m.tasks.length}, activities ${m.activities.length}, meetings ${m.meetings.length}, documents ${m.documents.length} | part1 ${head.length} stmts ${size(head)} bytes, part2 ${tail.length} stmts ${size(tail)} bytes`);
  for (const n of m.notes) console.log(`   note: ${n}`);
}
