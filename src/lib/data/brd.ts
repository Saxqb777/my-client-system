import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brdDrafts, brdGapChecks, brdItems, clients, documents, meetings, people, type BrdDraft, type BrdGapCheck, type BrdItem, type BrdItemStatus, type Meeting } from "@/lib/db/schema";
import { formatDate } from "@/lib/core/dates";
import { clock } from "@/lib/meetings/transcript";
import { BRD_DRAFT_VERSION, BRD_MODEL, checkBrdGaps, extractRequirements, writeBrdDraft } from "@/lib/ai/brd";
import { dedupeItems } from "@/lib/brd/extract";
import { coveredItemIds } from "@/lib/brd/gap";
import { renderBrdText } from "@/lib/brd/draft";

/** BRD helper data: requirement items per client, numbered drafts, gap checks. Nothing here deletes a row. */

export type BrdItemWithMeeting = BrdItem & { meeting: Pick<Meeting, "id" | "title" | "heldAt"> | null };

export async function listBrdItems(clientId: string): Promise<BrdItemWithMeeting[]> {
  const db = await getDb();
  const rows = await db.query.brdItems.findMany({
    where: eq(brdItems.clientId, clientId),
    with: { meeting: { columns: { id: true, title: true, heldAt: true } } },
    orderBy: [asc(brdItems.createdAt)],
  });
  return rows as BrdItemWithMeeting[];
}

export async function setBrdItemStatus(id: string, status: BrdItemStatus): Promise<BrdItem> {
  const db = await getDb();
  const [row] = await db.update(brdItems).set({ status }).where(eq(brdItems.id, id)).returning();
  if (!row) throw new Error("Item not found");
  return row;
}

/** Client meetings the helper can read: minuted or with a transcript, not Other Work. */
async function readableMeetings(clientId: string) {
  const db = await getDb();
  const rows = await db.query.meetings.findMany({
    where: and(eq(meetings.clientId, clientId), eq(meetings.otherWork, false), inArray(meetings.status, ["held", "minuted"])),
    with: { transcript: true },
    orderBy: [asc(meetings.heldAt)],
  });
  return rows.filter((m) => (m.transcript && m.transcript.segments.length > 0) || m.minutes?.points?.length || m.mom);
}

export async function meetingReadCounts(clientId: string): Promise<{ readable: number; read: number }> {
  const rows = await readableMeetings(clientId);
  return { readable: rows.length, read: rows.filter((m) => m.brdExtractedAt).length };
}

/** "BRD Session 2, 29 Sep 2026, 1:34" for a line's source. */
export function sourceLabel(item: Pick<BrdItemWithMeeting, "meeting" | "evidenceAt">): string {
  if (!item.meeting) return "";
  return `${item.meeting.title}, ${formatDate(item.meeting.heldAt)}${item.evidenceAt !== null && item.evidenceAt !== undefined ? `, ${clock(item.evidenceAt)}` : ""}`;
}

async function inPool<T, R>(list: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

export const MEETINGS_PER_RUN = 8;

/**
 * Reads the client's meetings that were not read yet (or all again) for requirements, up to MEETINGS_PER_RUN per call
 * so one click stays inside the function time limit. New items that repeat an existing one, dropped ones included, are skipped.
 */
export async function extractFromMeetings(clientId: string, opts: { rereadAll?: boolean } = {}): Promise<{ read: number; added: number; skipped: number; remaining: number; engine: "claude" | "rules" | "none" }> {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) throw new Error("Client not found");
  const all = await readableMeetings(clientId);
  const todo = opts.rereadAll ? all : all.filter((m) => !m.brdExtractedAt);
  const batch = todo.slice(0, MEETINGS_PER_RUN);
  if (!batch.length) return { read: 0, added: 0, skipped: 0, remaining: 0, engine: "none" };

  const results = await inPool(batch, 3, async (m) => ({
    meeting: m,
    ...(await extractRequirements({
      client: { name: client.name, code: client.code, system: client.system },
      meeting: { title: m.title, heldAt: m.heldAt },
      segments: m.transcript?.segments ?? [],
      points: m.minutes?.points ?? [],
      minutesText: m.mom,
    })),
  }));

  const existing = await db.query.brdItems.findMany({ where: eq(brdItems.clientId, clientId), columns: { text: true } });
  const known: { text: string }[] = [...existing];
  let added = 0;
  let skipped = 0;
  for (const r of results) {
    const fresh = dedupeItems(known, r.items);
    skipped += r.items.length - fresh.length;
    if (fresh.length) {
      await db.insert(brdItems).values(
        fresh.map((i) => ({ clientId, meetingId: r.meeting.id, kind: i.kind, text: i.text, groupName: i.group, evidenceQuote: i.evidence?.quote ?? null, evidenceAt: i.evidence?.at ?? null })),
      );
      known.push(...fresh);
      added += fresh.length;
    }
    await db.update(meetings).set({ brdExtractedAt: new Date() }).where(eq(meetings.id, r.meeting.id));
  }
  const engine = results.some((r) => r.engine === "claude") ? "claude" : "rules";
  return { read: batch.length, added, skipped, remaining: todo.length - batch.length, engine };
}

export async function listDrafts(clientId: string): Promise<Pick<BrdDraft, "id" | "version" | "createdAt" | "model">[]> {
  const db = await getDb();
  return db.query.brdDrafts.findMany({ where: eq(brdDrafts.clientId, clientId), columns: { id: true, version: true, createdAt: true, model: true }, orderBy: [desc(brdDrafts.version)] });
}

export async function getDraft(id: string): Promise<(BrdDraft & { client: { id: string; name: string; code: string; system: string | null } }) | null> {
  const db = await getDb();
  const row = await db.query.brdDrafts.findFirst({ where: eq(brdDrafts.id, id), with: { client: { columns: { id: true, name: true, code: true, system: true } } } });
  return (row as (BrdDraft & { client: { id: string; name: string; code: string; system: string | null } }) | undefined) ?? null;
}

export async function latestDraft(clientId: string): Promise<BrdDraft | null> {
  const db = await getDb();
  const row = await db.query.brdDrafts.findFirst({ where: eq(brdDrafts.clientId, clientId), orderBy: [desc(brdDrafts.version)] });
  return row ?? null;
}

/** Writes a new numbered draft from the current items and files it in the client's documents as a BRD. */
export async function writeDraft(clientId: string): Promise<{ draft: BrdDraft; engine: "claude" | "rules" }> {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) throw new Error("Client not found");
  const [items, ppl, mtgs, top] = await Promise.all([
    listBrdItems(clientId),
    db.query.people.findMany({ where: eq(people.clientId, clientId), orderBy: [desc(people.isPrimary), asc(people.name)] }),
    readableMeetings(clientId),
    db.select({ v: max(brdDrafts.version) }).from(brdDrafts).where(eq(brdDrafts.clientId, clientId)),
  ]);
  if (!items.some((i) => i.status !== "dropped")) throw new Error("No requirement items yet. Read the meetings first.");
  const readMeetings = mtgs.filter((m) => m.brdExtractedAt);
  const { sections, engine } = await writeBrdDraft({
    client: { id: client.id, name: client.name, code: client.code, fullName: client.fullName, system: client.system, phase: client.phase, notes: client.notes },
    people: ppl.map((p) => ({ name: p.name, role: p.role, side: p.side })),
    items,
    meetings: readMeetings.map((m) => ({ id: m.id, title: m.title, heldAt: m.heldAt })),
  });
  const version = Number(top[0]?.v ?? 0) + 1;
  const sources = new Map(items.map((i) => [i.id, sourceLabel(i)]));
  const text = renderBrdText(sections, { clientName: client.name, version, date: new Date(), sources });
  const [doc] = await db.insert(documents).values({ clientId, type: "brd", title: `${client.name}: BRD draft v${version}`, content: text, tags: ["brd", "draft"] }).returning();
  const [draft] = await db
    .insert(brdDrafts)
    .values({ clientId, version, sections, model: engine === "claude" ? BRD_MODEL : "rules", promptVersion: BRD_DRAFT_VERSION, documentId: doc.id })
    .returning();
  return { draft, engine };
}

export async function latestGapCheck(clientId: string): Promise<BrdGapCheck | null> {
  const db = await getDb();
  const row = await db.query.brdGapChecks.findFirst({ where: eq(brdGapChecks.clientId, clientId), orderBy: [desc(brdGapChecks.createdAt)] });
  return row ?? null;
}

export async function runGapCheck(clientId: string, sourceName: string, text: string): Promise<{ check: BrdGapCheck; engine: "claude" | "rules" }> {
  const db = await getDb();
  const items = await listBrdItems(clientId);
  if (!items.some((i) => i.status !== "dropped" && i.kind !== "pain_point")) throw new Error("No requirement items yet. Read the meetings first.");
  const { findings, engine } = await checkBrdGaps(text, items);
  const [check] = await db
    .insert(brdGapChecks)
    .values({ clientId, sourceName: sourceName.slice(0, 200) || "Pasted text", sourceText: text.slice(0, 400_000), findings, model: engine === "claude" ? BRD_MODEL : "rules" })
    .returning();
  return { check, engine };
}

/** After a gap check: every open item it did not report missing is marked covered. */
export async function markCoveredFromCheck(checkId: string): Promise<number> {
  const db = await getDb();
  const check = await db.query.brdGapChecks.findFirst({ where: eq(brdGapChecks.id, checkId) });
  if (!check) throw new Error("Gap check not found");
  const items = await listBrdItems(check.clientId);
  const ids = coveredItemIds(check.findings, items);
  if (ids.length) await db.update(brdItems).set({ status: "covered" }).where(inArray(brdItems.id, ids));
  return ids.length;
}

export type BrdOverviewRow = { clientId: string; name: string; code: string; items: number; open: number; covered: number; readable: number; read: number; draft: { id: string; version: number; createdAt: Date } | null; gap: { createdAt: Date; findings: number } | null };

export async function brdOverview(): Promise<BrdOverviewRow[]> {
  const db = await getDb();
  const live = await db.query.clients.findMany({ where: isNull(clients.archivedAt), orderBy: [asc(clients.sortOrder), asc(clients.name)] });
  return Promise.all(
    live.map(async (c) => {
      const [items, counts, draft, gap] = await Promise.all([
        db.query.brdItems.findMany({ where: eq(brdItems.clientId, c.id), columns: { status: true } }),
        meetingReadCounts(c.id),
        latestDraft(c.id),
        latestGapCheck(c.id),
      ]);
      return {
        clientId: c.id,
        name: c.name,
        code: c.code,
        items: items.filter((i) => i.status !== "dropped").length,
        open: items.filter((i) => i.status === "open").length,
        covered: items.filter((i) => i.status === "covered").length,
        ...counts,
        draft: draft ? { id: draft.id, version: draft.version, createdAt: draft.createdAt } : null,
        gap: gap ? { createdAt: gap.createdAt, findings: gap.findings.length } : null,
      };
    }),
  );
}
