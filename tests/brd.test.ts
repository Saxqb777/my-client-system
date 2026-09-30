import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { BrdItem, BrdSections } from "@/lib/db/schema";
import { classify, dedupeItems, rulesExtract, rulesExtractMinutes, tidyLine } from "@/lib/brd/extract";
import { ensureAllItems, renderBrdText, rulesDraft, sectionFor } from "@/lib/brd/draft";
import { coveredItemIds, rulesGap } from "@/lib/brd/gap";
import { docxToText, numbersIn, splitSentences, vagueReasons } from "@/lib/brd/text";
import { buildBrdDocx } from "@/lib/docs/brdDocx";
import { parseVtt } from "@/lib/meetings/transcript";

// Rule based paths only: no Claude in tests.
delete process.env.ANTHROPIC_API_KEY;

function item(over: Partial<BrdItem> & Pick<BrdItem, "id" | "kind" | "text">): BrdItem {
  return { clientId: "c1", meetingId: "m1", groupName: null, evidenceQuote: null, evidenceAt: null, status: "open", createdAt: new Date("2026-09-29T08:00:00Z"), updatedAt: new Date("2026-09-29T08:00:00Z"), ...over };
}

const ITEMS: BrdItem[] = [
  item({ id: "i1", kind: "requirement", text: "The OMS supports three customer tiers: tenant, registered customer and walk in", groupName: "Customer Tiers", evidenceQuote: "We have three tiers today: tenant, registered customer and walk in", evidenceAt: 22 }),
  item({ id: "i2", kind: "business_rule", text: "Each service charge can have a different rate per tier", groupName: "Rate Matrix", evidenceAt: 41 }),
  item({ id: "i3", kind: "business_rule", text: "The deposit policy is one month of estimated charges", groupName: "Wallet", evidenceAt: 126 }),
  item({ id: "i4", kind: "requirement", text: "The wallet shows the held deposit separately from the available balance", groupName: "Wallet", evidenceAt: 146 }),
  item({ id: "i5", kind: "integration", text: "The wallet top up goes through Maqta Pay like the other payments", groupName: "Wallet", evidenceAt: 177 }),
  item({ id: "i6", kind: "pain_point", text: "Without time bands the parking revenue will not match what the board approved", groupName: "Rate Matrix", evidenceAt: 113 }),
  item({ id: "i7", kind: "requirement", text: "Access to the rate matrix is limited by role based permission", groupName: "Rate Matrix" }),
  item({ id: "i8", kind: "exception", text: "Requests already in progress continue even when the balance goes below zero", groupName: "Wallet", status: "dropped" }),
];

describe("reading requirements from a meeting, rules", () => {
  it("classifies spoken sentences", () => {
    expect(classify("Each service charge can have a different rate per tier.")).toBe("business_rule");
    expect(classify("Finance wants the deposit to be shown separately from the usable balance.")).toBe("requirement");
    expect(classify("The wallet balance must be visible in the portal and the top up goes through Maqta Pay.")).toBe("integration");
    expect(classify("Requests already in progress continue even when the balance is below zero.")).toBe("exception");
    expect(classify("Can the matrix hold time bands or is it one rate per service?")).toBeNull();
    expect(classify("Thanks everyone.")).toBeNull();
  });

  it("pulls items with the second they were said at from the ADFH fixture", () => {
    const t = parseVtt(readFileSync("tests/fixtures/sample-meeting.vtt", "utf8"));
    const items = rulesExtract(t.segments);
    const rule = items.find((i) => i.text === "Each service charge can have a different rate per tier");
    expect(rule?.kind).toBe("business_rule");
    expect(rule?.evidence?.at).toBe(41);
    expect(items.some((i) => i.kind === "integration" && /Maqta Pay/.test(i.text))).toBe(true);
    expect(items.some((i) => i.kind === "requirement" && /deposit to be shown separately/.test(i.text))).toBe(true);
    expect(items.every((i) => i.evidence && i.evidence.at !== null)).toBe(true);
    expect(items.every((i) => !/[—–]/.test(i.text))).toBe(true);
  });

  it("reads minutes when there is no transcript, with no time", () => {
    const items = rulesExtractMinutes([{ topic: "Wallet", text: "The deposit policy is one month of estimated charges. Finance wants the deposit to be shown separately from the balance." }]);
    expect(items).toHaveLength(2);
    expect(items[0].group).toBe("Wallet");
    expect(items.every((i) => i.evidence?.at === null)).toBe(true);
  });

  it("never uses a placeholder minutes topic as a group", () => {
    const t = parseVtt(readFileSync("tests/fixtures/sample-meeting.vtt", "utf8"));
    const items = rulesExtract(t.segments, [{ topic: "Transcript", text: t.fullText.slice(0, 1200) }]);
    expect(items.every((i) => i.group !== "Transcript")).toBe(true);
    expect(rulesExtractMinutes([{ topic: "Transcript", text: "The deposit policy is one month of estimated charges." }])[0].group).toBeNull();
  });

  it("tidies filler openings and drops near duplicates", () => {
    expect(tidyLine("So, and the wallet balance must be visible.")).toBe("The wallet balance must be visible");
    const kept = dedupeItems([{ text: "Each service charge can have a different rate per tier" }], [{ text: "Each service charge has a different rate per customer tier" }, { text: "The deposit policy is one month of charges" }]);
    expect(kept.map((k) => k.text)).toEqual(["The deposit policy is one month of charges"]);
  });
});

describe("the draft BRD", () => {
  const input = {
    client: { id: "c1", name: "ADFH OMS", code: "ADFH", fullName: "Abu Dhabi Food Hub", system: "Operations Management System (OMS)", phase: "requirements", notes: null },
    people: [{ name: "Nadia Haddad", role: "Finance lead", side: "client" }],
    items: ITEMS,
    meetings: [{ id: "m1", title: "ADFH x Fero BRD Session 2", heldAt: new Date("2026-09-29T05:00:00Z") }],
  };

  it("puts every live item in exactly one numbered line, drops stay out, pain points go to the current process", () => {
    const s = rulesDraft(input);
    const all = [...s.functional, ...s.nonFunctional, ...s.businessRules, ...s.integrations];
    const ids = all.flatMap((l) => l.itemIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(["i1", "i2", "i3", "i4", "i5", "i7"]);
    expect(s.functional.map((l) => l.id)).toEqual(["FR1", "FR2"]);
    expect(s.nonFunctional.map((l) => l.itemIds)).toEqual([["i7"]]);
    expect(s.businessRules.map((l) => l.id)).toEqual(["BR1", "BR2"]);
    expect(s.integrations[0].id).toBe("INT1");
    expect(s.currentProcess).toContain("parking revenue will not match");
    expect(s.scopeIn).toEqual(expect.arrayContaining(["Customer Tiers", "Rate Matrix", "Wallet"]));
    expect(s.purpose).toContain("Abu Dhabi Food Hub");
  });

  it("adds items Claude left out, so every requirement stays traceable", () => {
    const partial: BrdSections = { ...rulesDraft(input), functional: [{ id: "x", text: "Tiers", itemIds: ["i1"] }], businessRules: [], integrations: [] };
    const fixed = ensureAllItems(partial, ITEMS);
    const ids = [...fixed.functional, ...fixed.nonFunctional, ...fixed.businessRules, ...fixed.integrations].flatMap((l) => l.itemIds);
    expect(ids).toEqual(expect.arrayContaining(["i1", "i2", "i3", "i4", "i5", "i7"]));
    expect(ids).not.toContain("i8");
    expect(fixed.functional[0].id).toBe("FR1");
    expect(sectionFor({ kind: "exception", text: "x" })).toBe("businessRules");
  });

  it("renders plain text with sources and no dash punctuation", () => {
    const s = rulesDraft(input);
    const text = renderBrdText(s, { clientName: "ADFH OMS", version: 1, date: new Date("2026-09-30T08:00:00Z"), sources: new Map([["i2", "ADFH x Fero BRD Session 2, 29 Sep 2026, 0:41"]]) });
    expect(text).toContain("1. Purpose");
    expect(text).toContain("13. Open questions");
    expect(text).toMatch(/BR\d\. Each service charge can have a different rate per tier \(source: ADFH x Fero BRD Session 2, 29 Sep 2026, 0:41\)/);
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/^\s*-\s/m);
  });

  it("builds a Word file that reads back with every section, the line ids and the sources", async () => {
    const s = rulesDraft(input);
    const buf = await buildBrdDocx({ clientCode: "ADFH", clientName: "ADFH OMS", project: "OMS Project", version: 2, date: new Date("2026-09-30T08:00:00Z"), meetingsRead: 1, sections: s, sources: new Map([["i2", "ADFH x Fero BRD Session 2, 29 Sep 2026, 0:41"]]) });
    const text = await docxToText(buf);
    expect(text).toContain("ADFH × Fero | Business Requirements Document");
    expect(text).toContain("Draft v2");
    for (const h of ["1. Purpose", "2. In scope", "7. Functional requirements", "9. Business rules", "13. Open questions"]) expect(text).toContain(h);
    expect(text).toMatch(/BR\d\tEach service charge can have a different rate per tier\tADFH x Fero BRD Session 2, 29 Sep 2026, 0:41/);
    expect(text).not.toMatch(/[—–]/);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
    expect(footers.join("")).toContain("Confidential | Internal Use Only");
  });
});

describe("gap check, rules", () => {
  const brd = readFileSync("tests/fixtures/adfh-brd-excerpt.txt", "utf8");

  it("finds what is missing, what contradicts, and what is vague", () => {
    const f = rulesGap(brd, ITEMS);
    const missing = f.filter((x) => x.kind === "missing").map((x) => x.itemId);
    expect(missing).toEqual(expect.arrayContaining(["i3", "i4"]));
    expect(missing).not.toContain("i2");
    expect(missing).not.toContain("i6");
    expect(missing).not.toContain("i8");
    const contra = f.find((x) => x.kind === "contradiction");
    expect(contra?.itemId).toBe("i1");
    expect(contra?.brdLine).toContain("four customer tiers");
    expect(contra?.at).toBe(22);
    const vague = f.filter((x) => x.kind === "vague").map((x) => x.brdLine);
    expect(vague).toEqual(expect.arrayContaining(["The wallet screen should be user friendly and load fast.", "Reports will include relevant data as needed."]));
  });

  it("counts the covered items", () => {
    const f = rulesGap(brd, ITEMS);
    expect(coveredItemIds(f, ITEMS).sort()).toEqual(expect.arrayContaining(["i1", "i2"]));
    expect(coveredItemIds(f, ITEMS)).not.toContain("i6");
  });

  it("reads numbers as digits or words and names vague wording", () => {
    expect(numbersIn("four customer tiers and 30 days")).toEqual(expect.arrayContaining(["4", "30"]));
    expect(vagueReasons("Load it quickly, etc.")).toEqual(expect.arrayContaining(["no time given", "etc"]));
    expect(splitSentences("• One two three. 2) Four five six\nSeven.")).toEqual(["One two three.", "Four five six"]);
  });
});

describe("BRD helper against a real database", () => {
  process.env.DATABASE_URL = "pglite://memory";
  let clientId = "";
  let otherId = "";

  beforeAll(async () => {
    const { getDb } = await import("@/lib/db");
    const { clients, meetings, meetingTranscripts, people } = await import("@/lib/db/schema");
    const db = await getDb();
    const [c] = await db.insert(clients).values({ name: "ADFH OMS", code: "ADFHT", system: "Operations Management System (OMS)", phase: "requirements" }).returning();
    clientId = c.id;
    await db.insert(people).values({ clientId, name: "Nadia Haddad", role: "Finance lead", side: "client" });
    const t = parseVtt(readFileSync("tests/fixtures/sample-meeting.vtt", "utf8"));
    const [m] = await db.insert(meetings).values({ clientId, title: "ADFH x Fero BRD Session 2", heldAt: new Date("2026-09-29T05:00:00Z"), status: "minuted", minutes: { objective: "Commercial configurations", points: [{ topic: "Wallet", text: "Deposit shown separately" }] } }).returning();
    await db.insert(meetingTranscripts).values({ meetingId: m.id, fullText: t.fullText, segments: t.segments, wordCount: t.wordCount });
    const [o] = await db.insert(meetings).values({ clientId: null, otherWork: true, title: "Fero product sync", heldAt: new Date("2026-09-29T09:00:00Z"), status: "minuted", mom: "Finance wants the deposit to be shown separately from the usable balance." }).returning();
    otherId = o.id;
  }, 60_000);

  it("reads the client's meetings once, never Other Work, and skips repeats on a second read", async () => {
    const { extractFromMeetings, listBrdItems, meetingReadCounts } = await import("@/lib/data/brd");
    const first = await extractFromMeetings(clientId);
    expect(first.read).toBe(1);
    expect(first.added).toBeGreaterThanOrEqual(5);
    expect(first.engine).toBe("rules");
    expect(await meetingReadCounts(clientId)).toEqual({ readable: 1, read: 1 });
    const again = await extractFromMeetings(clientId);
    expect(again.read).toBe(0);
    const reread = await extractFromMeetings(clientId, { rereadAll: true });
    expect(reread.read).toBe(1);
    expect(reread.added).toBe(0);
    const items = await listBrdItems(clientId);
    expect(items.every((i) => i.meetingId !== otherId)).toBe(true);
    expect(items.every((i) => i.meeting?.title === "ADFH x Fero BRD Session 2")).toBe(true);
  });

  it("writes numbered drafts, files each as a BRD document, and keeps every item traceable", async () => {
    const { writeDraft, listBrdItems, listDrafts } = await import("@/lib/data/brd");
    const { getDb } = await import("@/lib/db");
    const { documents } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { draft } = await writeDraft(clientId);
    expect(draft.version).toBe(1);
    const items = (await listBrdItems(clientId)).filter((i) => i.kind !== "pain_point");
    const ids = [...draft.sections.functional, ...draft.sections.nonFunctional, ...draft.sections.businessRules, ...draft.sections.integrations].flatMap((l) => l.itemIds);
    expect(ids.sort()).toEqual(items.map((i) => i.id).sort());
    const db = await getDb();
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, draft.documentId!) });
    expect(doc?.type).toBe("brd");
    expect(doc?.title).toBe("ADFH OMS: BRD draft v1");
    const second = await writeDraft(clientId);
    expect(second.draft.version).toBe(2);
    expect((await listDrafts(clientId)).map((d) => d.version)).toEqual([2, 1]);
  });

  it("runs a gap check, stores it, and marks covered items on request", async () => {
    const { runGapCheck, latestGapCheck, markCoveredFromCheck, listBrdItems } = await import("@/lib/data/brd");
    const { check } = await runGapCheck(clientId, "adfh-brd-excerpt.txt", readFileSync("tests/fixtures/adfh-brd-excerpt.txt", "utf8"));
    expect(check.findings.some((f) => f.kind === "missing")).toBe(true);
    expect(check.findings.some((f) => f.kind === "vague")).toBe(true);
    expect((await latestGapCheck(clientId))?.id).toBe(check.id);
    const marked = await markCoveredFromCheck(check.id);
    const items = await listBrdItems(clientId);
    expect(items.filter((i) => i.status === "covered")).toHaveLength(marked);
    const missing = new Set(check.findings.filter((f) => f.kind === "missing").map((f) => f.itemId));
    expect(items.filter((i) => i.status === "covered").every((i) => !missing.has(i.id))).toBe(true);
  });
});
