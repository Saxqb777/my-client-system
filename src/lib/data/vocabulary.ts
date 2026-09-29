import { asc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vocabulary, type Client, type Person, type VocabularyTerm } from "@/lib/db/schema";

export async function listVocabulary(): Promise<VocabularyTerm[]> {
  const db = await getDb();
  return db.query.vocabulary.findMany({ orderBy: [asc(vocabulary.term)] });
}

export type VocabularySeed = { term: string; type: VocabularyTerm["type"]; meaning: string | null; clientId: string | null };

/** The fixed part of the list: Fero, its products and the acronyms Saaqib's meetings use. */
export const BASE_VOCABULARY: VocabularySeed[] = [
  { term: "Fero AI", type: "product", meaning: "The company. Its products are TAME (TMS), FMS, DASH and OMS.", clientId: null },
  { term: "TAME", type: "product", meaning: "Fero transport management system", clientId: null },
  { term: "TMS", type: "acronym", meaning: "Transport management system", clientId: null },
  { term: "FMS", type: "acronym", meaning: "Freight management system", clientId: null },
  { term: "OMS", type: "acronym", meaning: "Operations management system", clientId: null },
  { term: "DASH", type: "product", meaning: "Fero dispatch and delivery management", clientId: null },
  { term: "BRD", type: "acronym", meaning: "Business requirements document", clientId: null },
  { term: "MOM", type: "acronym", meaning: "Minutes of meeting", clientId: null },
  { term: "HLD", type: "acronym", meaning: "High level design", clientId: null },
  { term: "SIT", type: "acronym", meaning: "System integration testing", clientId: null },
  { term: "UAT", type: "acronym", meaning: "User acceptance testing", clientId: null },
  { term: "POD", type: "acronym", meaning: "Proof of delivery", clientId: null },
  { term: "KEZAD", type: "acronym", meaning: "Khalifa Economic Zones Abu Dhabi", clientId: null },
  { term: "FTA", type: "acronym", meaning: "Federal Tax Authority, UAE", clientId: null },
  { term: "Maqta Pay", type: "product", meaning: "AD Ports payment gateway", clientId: null },
  { term: "SCADA", type: "acronym", meaning: "Plant control system feeding cooling data", clientId: null },
  { term: "ANPR", type: "acronym", meaning: "Automatic number plate recognition", clientId: null },
  { term: "IBAN", type: "acronym", meaning: "Bank account number", clientId: null },
];

/** Builds the seed from the real clients and their people. Pure, so it is tested and reviewable before it runs. */
export function buildVocabularySeed(clients: Pick<Client, "id" | "code" | "name" | "fullName" | "aliases" | "system">[], people: Pick<Person, "clientId" | "name" | "role" | "side">[]): VocabularySeed[] {
  const out = new Map<string, VocabularySeed>();
  const add = (s: VocabularySeed) => {
    const key = s.term.toLowerCase();
    if (!out.has(key)) out.set(key, s);
  };
  for (const b of BASE_VOCABULARY) add(b);
  for (const c of clients) {
    add({ term: c.code, type: "client", meaning: c.fullName ? `${c.name}, ${c.fullName}` : c.name, clientId: c.id });
    add({ term: c.name, type: "client", meaning: c.fullName ?? null, clientId: c.id });
    if (c.fullName) add({ term: c.fullName.split(",")[0].trim(), type: "client", meaning: `Full name of ${c.code}`, clientId: c.id });
    for (const a of c.aliases ?? []) if (a.trim().length >= 3) add({ term: a.trim(), type: "client", meaning: `Alias of ${c.code}`, clientId: c.id });
    const acronym = c.system?.match(/\(([A-Z][A-Z0-9]{1,6})\)/)?.[1];
    if (acronym) add({ term: acronym, type: "product", meaning: `${c.code} system: ${c.system}`, clientId: c.id });
  }
  for (const p of people) {
    if (p.name.trim().length < 4) continue;
    add({ term: p.name.trim(), type: "person", meaning: [p.role, p.side === "internal" ? "Fero" : null].filter(Boolean).join(", ") || null, clientId: p.side === "internal" ? null : p.clientId });
  }
  return Array.from(out.values());
}

/** Inserts what is missing, never overwrites a term Saaqib edited. */
export async function seedVocabulary(rows: VocabularySeed[]): Promise<number> {
  const db = await getDb();
  let added = 0;
  for (const r of rows) {
    const res = (await db.execute(sql`insert into vocabulary (term, type, meaning, client_id) values (${r.term}, ${r.type}, ${r.meaning}, ${r.clientId}) on conflict (lower(term)) do nothing returning id`)) as { rows?: unknown[] };
    if (res.rows?.length) added++;
  }
  return added;
}
