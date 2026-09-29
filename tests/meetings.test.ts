import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkSegments, clock, mergeRuns, parseClock, parsePlainText, parseTranscriptText, parseVtt, transcriptForPrompt } from "@/lib/meetings/transcript";
import { clientTerms, matchClient, type MatchClient } from "@/lib/meetings/match";
import { ingestHash, transcriptFromBody, ingestBodySchema } from "@/lib/meetings/ingest";
import { buildVocabularySeed } from "@/lib/data/vocabulary";

const vtt = readFileSync("tests/fixtures/sample-meeting.vtt", "utf8");

describe("transcript parsing", () => {
  it("reads clocks", () => {
    expect(parseClock("00:01:02.500")).toBe(62.5);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("02:03")).toBe(123);
    expect(parseClock("nope")).toBeNull();
  });
  it("parses WebVTT with voice tags and merges runs by speaker", () => {
    const t = parseVtt(vtt);
    expect(t.segments[0].speaker).toBe("Saaqib Irfan");
    expect(t.segments[0].start).toBe(4);
    expect(t.segments[0].text).toContain("session two of the BRD series");
    // the first two cues are the same speaker within 3 seconds, so they merge
    expect(t.segments[0].text).toContain("rate matrix");
    expect(t.segments.some((s) => s.speaker === "Nadia Haddad")).toBe(true);
    expect(t.wordCount).toBeGreaterThan(300);
    expect(Math.round(t.durationSec)).toBe(380);
    expect(t.fullText).not.toContain("<v");
  });
  it("parses plain text with and without clocks", () => {
    const a = parsePlainText("[00:00:10] Me: Hello team\n[00:00:20] Others: Hi Saaqib");
    expect(a.segments).toEqual([
      { start: 10, end: 10 + 2, speaker: "Me", text: "Hello team" },
      { start: 20, end: 20 + 2, speaker: "Others", text: "Hi Saaqib" },
    ]);
    const b = parsePlainText("Nadia: We need the tiers first because Finance keeps asking about them\nplain line without a speaker");
    expect(b.segments[0].speaker).toBe("Nadia");
    expect(b.segments[1].speaker).toBe("other");
    expect(b.segments[1].start).toBeGreaterThan(0);
  });
  it("detects the format from the text", () => {
    expect(parseTranscriptText(vtt).segments.length).toBeGreaterThan(5);
    const plain = parseTranscriptText("just notes\nmore notes");
    expect(plain.fullText).toContain("just notes");
    expect(plain.fullText).toContain("more notes");
  });
  it("renders prompt lines with Me and Others", () => {
    const text = transcriptForPrompt([{ start: 65, end: 70, speaker: "me", text: "Hello" }, { start: 71, end: 75, speaker: "other", text: "Hi" }]);
    expect(text).toBe("[1:05] Me: Hello\n[1:11] Others: Hi");
    expect(clock(3725)).toBe("1:02:05");
  });
  it("chunks long transcripts at 45 minutes", () => {
    const segs = Array.from({ length: 200 }, (_, i) => ({ start: i * 60, end: i * 60 + 50, speaker: "other", text: `line ${i}` }));
    const chunks = chunkSegments(segs, 45);
    expect(chunks.length).toBe(5);
    expect(chunks.flat()).toHaveLength(200);
    const close = [
      { start: 0, end: 4, speaker: "me", text: "one" },
      { start: 5, end: 9, speaker: "me", text: "two" },
      { start: 30, end: 34, speaker: "me", text: "three" },
    ];
    expect(mergeRuns(close).map((s) => s.text)).toEqual(["one two", "three"]);
  });
});

const clients: MatchClient[] = [
  { id: "adfh", code: "ADFH", name: "ADFH OMS", aliases: ["Food Hub"], system: "Operations Management System (OMS)", fullName: "Abu Dhabi Food Hub, under KEZAD, AD Ports Group", people: [{ name: "Nadia Haddad", side: "client" }, { name: "Saaqib Irfan", side: "internal" }] },
  { id: "ids", code: "IDS", name: "IDS DASH", aliases: ["Etihad Drug"], system: "DASH (Fero dispatch and delivery management)", fullName: "IDS (Al Etihad Drug Store)", people: [{ name: "Ameen Khan", side: "client" }] },
  { id: "rsa", code: "RSA", name: "RSA Talke", aliases: [], system: "TAME by Fero (TMS)", fullName: "RSA Talke", people: [] },
];

describe("client matching", () => {
  it("collects strong terms per client", () => {
    const terms = clientTerms(clients[0]);
    expect(terms).toEqual(expect.arrayContaining(["ADFH", "ADFH OMS", "Food Hub", "OMS"]));
    expect(terms).not.toContain("Group");
  });
  it("links the fixture to ADFH with confidence above the bar", () => {
    const t = parseVtt(vtt);
    const r = matchClient({ calendarTitle: "ADFH x Fero BRD Session 2", attendees: ["Nadia Haddad", "Omar Rashed"], text: t.fullText }, clients);
    expect(r.clientId).toBe("adfh");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.reason).toContain("Title mentions ADFH");
    expect(r.reason).toContain("Nadia Haddad");
  });
  it("sends a vague meeting to needs review and an internal one to nothing", () => {
    const weak = matchClient({ calendarTitle: "Weekly sync", attendees: [], text: "We talked about the OMS rollout and the DASH sprint." }, clients);
    expect(weak.clientId === null || weak.confidence < 0.8).toBe(true);
    const none = matchClient({ calendarTitle: "Fero product standup", attendees: [], text: "Sprint planning and holidays." }, clients);
    expect(none.clientId).toBeNull();
    expect(none.confidence).toBe(0);
  });
  it("lowers confidence when two clients compete", () => {
    const r = matchClient({ calendarTitle: "ADFH and IDS status", attendees: [], text: "ADFH ADFH IDS IDS Etihad Drug Food Hub" }, clients);
    expect(r.confidence).toBeLessThanOrEqual(0.6);
    expect(r.reason).toMatch(/Could be/);
  });
  it("does not let a short code match inside a word", () => {
    const r = matchClient({ text: "the ids of the records were wrong" }, clients);
    expect(r.candidates.find((c) => c.code === "IDS")).toBeUndefined();
  });
});

describe("ingest", () => {
  it("hashes on the start minute and the opening words", () => {
    const a = ingestHash("2026-09-29T09:03:12+04:00", "Good morning everyone, this is the ADFH session");
    const b = ingestHash("2026-09-29T09:03:55+04:00", "Good morning everyone,  this is the ADFH session!");
    const c = ingestHash("2026-09-29T09:04:00+04:00", "Good morning everyone, this is the ADFH session");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("accepts segments or text and builds the transcript", () => {
    const body = ingestBodySchema.parse({ startedAt: "2026-09-29T09:00:00+04:00", segments: [{ start: 0, end: 5, speaker: "me", text: "Hello" }, { start: 6, end: 9, speaker: "other", text: "Hi there" }] });
    const t = transcriptFromBody(body);
    expect(t.fullText).toBe("Hello\nHi there");
    expect(t.wordCount).toBe(3);
    expect(() => ingestBodySchema.parse({ startedAt: "2026-09-29T09:00:00+04:00", fullText: "too short" })).toThrow();
  });
});

describe("vocabulary seed", () => {
  it("builds terms from clients and people without duplicates", () => {
    const rows = buildVocabularySeed(
      [{ id: "adfh", code: "ADFH", name: "ADFH OMS", fullName: "Abu Dhabi Food Hub, under KEZAD", aliases: ["Food Hub"], system: "Operations Management System (OMS)" }],
      [{ clientId: "adfh", name: "Nadia Haddad", role: "Finance lead", side: "client" }, { clientId: "adfh", name: "Saaqib Irfan", role: "Product Analyst", side: "internal" }],
    );
    const terms = rows.map((r) => r.term);
    expect(terms).toEqual(expect.arrayContaining(["ADFH", "ADFH OMS", "Abu Dhabi Food Hub", "Food Hub", "OMS", "Nadia Haddad", "Saaqib Irfan", "BRD", "UAT"]));
    expect(new Set(terms.map((t) => t.toLowerCase())).size).toBe(terms.length);
    expect(rows.find((r) => r.term === "Saaqib Irfan")?.clientId).toBeNull();
    expect(rows.find((r) => r.term === "Nadia Haddad")?.clientId).toBe("adfh");
  });
});
