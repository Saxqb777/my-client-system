/**
 * Converts a session update JSON plus a snapshot of the client's current state into SQL statements
 * for the Neon connector. Usage: tsx scripts/import-update-sql.ts <update.json> <context.json> <out.json>
 * The context JSON has the UpdateContext shape (see src/lib/import/mapUpdate.ts) and is filled from a few
 * connector queries. Output is one JSON array of statements to run in one transaction.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { updateExportSchema } from "../src/lib/import/updateSchema";
import { mapUpdate, type UpdateContext } from "../src/lib/import/mapUpdate";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
const textArr = (a: string[]) => `ARRAY[${a.map((x) => lit(x)).join(",")}]::text[]`;
const jsonb = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const [updateFile, contextFile, outFile] = process.argv.slice(2);
if (!updateFile || !contextFile || !outFile) {
  console.error("usage: tsx scripts/import-update-sql.ts <update.json> <context.json> <out.json>");
  process.exit(1);
}
const input = updateExportSchema.parse(JSON.parse(fs.readFileSync(updateFile, "utf8")));
const ctx = JSON.parse(fs.readFileSync(contextFile, "utf8")) as UpdateContext;
if (input.client_code.toUpperCase() !== ctx.client.code.toUpperCase()) throw new Error(`Update is for ${input.client_code}, context is for ${ctx.client.code}`);
const m = mapUpdate(input, ctx);
const cid = lit(ctx.client.id);
const sql: string[] = [];

// Client
const cols: string[] = [];
const p = m.clientPatch;
if (p.phase !== undefined) cols.push(`phase=${lit(p.phase)}`);
if (p.health !== undefined) cols.push(`health=${lit(p.health)}`);
if (p.nextStep !== undefined) cols.push(`next_step=${lit(p.nextStep)}`);
if (p.phaseStartDate !== undefined) cols.push(`phase_start_date=${lit(p.phaseStartDate)}`);
if (p.phaseTargetDate !== undefined) cols.push(`phase_target_date=${lit(p.phaseTargetDate)}`);
if (p.phaseTargetOriginal !== undefined) cols.push(`phase_target_original=${lit(p.phaseTargetOriginal)}`);
if (p.notes !== undefined) cols.push(`notes=${lit(p.notes)}`);
if (cols.length) sql.push(`UPDATE clients SET ${cols.join(", ")}, updated_at=now() WHERE id=${cid}`);

// Milestones
for (const mv of m.milestoneMoves) sql.push(`UPDATE milestones SET date=${lit(mv.to)}, date_history=date_history || ${jsonb([mv.entry])}, updated_at=now() WHERE id=${lit(mv.id)}`);

// Meetings with their document
const meetingIds: string[] = [];
for (const mt of m.meetings) {
  const mid = randomUUID();
  const did = randomUUID();
  meetingIds.push(mid);
  sql.push(
    `INSERT INTO meetings (id,client_id,title,held_at,status,attendees,mom,minutes,action_items,document_id,is_demo) VALUES (${lit(mid)},${cid},${lit(mt.title)},${lit(mt.heldAt)},'minuted',${jsonb(mt.attendees)},${lit(mt.mom)},${jsonb(mt.minutes)},${jsonb(mt.actionItems)},${lit(did)},false)`,
  );
  sql.push(`INSERT INTO documents (id,client_id,type,title,content,tags,meeting_id,is_demo) VALUES (${lit(did)},${cid},'mom',${lit(mt.document.title)},${lit(mt.mom)},${textArr(mt.document.tags)},${lit(mid)},false)`);
}

// Activities
for (const a of m.activities) {
  const meetingId = a.linksMeeting && meetingIds[0] ? lit(meetingIds[0]) : "NULL";
  sql.push(`INSERT INTO activities (client_id,type,title,body,occurred_at,source,tags,meeting_id,is_demo) VALUES (${cid},${lit(a.type)},${lit(a.title)},${lit(a.body)},${lit(a.occurredAt)},'import',${textArr(a.tags)},${meetingId},false)`);
}

// Tasks
for (const t of m.tasks) {
  const meetingId = t.fromMeeting && meetingIds[0] ? lit(meetingIds[0]) : "NULL";
  sql.push(`INSERT INTO tasks (client_id,title,details,status,priority,due_date,waiting_on,waiting_since,source_meeting_id,is_demo) VALUES (${cid},${lit(t.title)},${lit(t.details)},${lit(t.status)},${lit(t.priority)},${lit(t.dueDate)},${lit(t.waitingOn)},${lit(t.waitingSince)},${meetingId},false)`);
}
for (const t of m.closeTasks) {
  sql.push(`UPDATE tasks SET status='done', completed_at=${lit(new Date(`${t.closedOn}T08:00:00.000Z`))}, details=${t.outcome ? `concat_ws(E'\\n', details, ${lit(`Outcome: ${t.outcome}`)})` : "details"}, updated_at=now() WHERE id=${lit(t.id)}`);
}

// Documents
for (const d of m.documents) {
  if (d.replacesId) sql.push(`DELETE FROM documents WHERE id=${lit(d.replacesId)}`);
  sql.push(`INSERT INTO documents (client_id,type,title,content,tags,is_demo) VALUES (${cid},${lit(d.type)},${lit(d.title)},${lit(d.content)},${textArr(d.tags)},false)`);
}
if (m.riskAppend) {
  if (m.riskAppend.documentId) sql.push(`UPDATE documents SET content=content || ${lit(`\n\n${m.riskAppend.text}`)}, updated_at=now() WHERE id=${lit(m.riskAppend.documentId)}`);
  else sql.push(`INSERT INTO documents (client_id,type,title,content,tags,is_demo) VALUES (${cid},'other',${lit(m.riskAppend.title)},${lit(m.riskAppend.text)},${textArr(["risks", "imported"])},false)`);
}

fs.writeFileSync(outFile, JSON.stringify(sql));
console.log(`${ctx.client.code}: ${sql.length} statements, ${JSON.stringify(sql).length} bytes`);
console.log(`  client fields: ${Object.keys(m.clientPatch).join(", ") || "none"}`);
console.log(`  milestone moves ${m.milestoneMoves.length}, meetings ${m.meetings.length}, activities ${m.activities.length}, tasks ${m.tasks.length} (+${m.closeTasks.length} closed), documents ${m.documents.length}${m.riskAppend ? ", risks appended" : ""}`);
for (const n of m.notes) console.log(`  note: ${n}`);
