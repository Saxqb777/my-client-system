import type { BrdItem, BrdLine, BrdSections } from "@/lib/db/schema";
import { formatDate } from "@/lib/core/dates";
import { cleanStyle } from "@/lib/core/style";
import { realTopic } from "./extract";

/**
 * The draft BRD: fixed sections, every requirement line linked to the items it came from. The rule based
 * assembly below is the fallback; Claude writes the same shape with proper prose (src/lib/ai/brd.ts).
 */

export type DraftInput = {
  client: { id: string; name: string; code: string; fullName: string | null; system: string | null; phase: string; notes: string | null };
  people: { name: string; role: string | null; side: string }[];
  items: BrdItem[];
  meetings: { id: string; title: string; heldAt: Date }[];
};

type SectionKey = keyof BrdSections;

export const BRD_SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "purpose", title: "Purpose" },
  { key: "scopeIn", title: "In scope" },
  { key: "scopeOut", title: "Out of scope" },
  { key: "stakeholders", title: "Stakeholders" },
  { key: "currentProcess", title: "Current process" },
  { key: "proposedProcess", title: "Proposed process" },
  { key: "functional", title: "Functional requirements" },
  { key: "nonFunctional", title: "Non functional requirements" },
  { key: "businessRules", title: "Business rules" },
  { key: "integrations", title: "Integrations" },
  { key: "assumptions", title: "Assumptions" },
  { key: "dependencies", title: "Dependencies" },
  { key: "openQuestions", title: "Open questions" },
];

/** Sections that hold requirement lines, their ID prefix, and the item kinds that belong in them. */
export const LINE_SECTIONS: { key: "functional" | "nonFunctional" | "businessRules" | "integrations"; prefix: string }[] = [
  { key: "functional", prefix: "FR" },
  { key: "nonFunctional", prefix: "NFR" },
  { key: "businessRules", prefix: "BR" },
  { key: "integrations", prefix: "INT" },
];

const NON_FUNCTIONAL = /\b(performance|response time|load time|uptime|availability|security|encrypt\w*|audit trail|audit log|logging|backup|retention|role based|permission|access level|scalab\w*|browser|mobile app|arabic|bilingual|accessib\w*|concurren\w*|sla)\b/i;

export function sectionFor(item: Pick<BrdItem, "kind" | "text">): "functional" | "nonFunctional" | "businessRules" | "integrations" | null {
  if (item.kind === "integration") return "integrations";
  if (item.kind === "business_rule" || item.kind === "exception") return "businessRules";
  if (item.kind === "requirement") return NON_FUNCTIONAL.test(item.text) ? "nonFunctional" : "functional";
  return null;
}

/** Numbers the lines of each requirement section in order: FR1, FR2, BR1 and so on. */
export function numberLines(sections: BrdSections): BrdSections {
  const out = { ...sections };
  for (const { key, prefix } of LINE_SECTIONS) out[key] = sections[key].map((l, i) => ({ ...l, id: `${prefix}${i + 1}` }));
  return out;
}

/**
 * Every live requirement, rule, exception and integration item must be traceable in the draft. Items Claude left
 * out are appended to their section with their own wording, so nothing said in a meeting goes missing.
 */
export function ensureAllItems(sections: BrdSections, items: BrdItem[]): BrdSections {
  const used = new Set(LINE_SECTIONS.flatMap(({ key }) => sections[key].flatMap((l) => l.itemIds)));
  const out = { ...sections, functional: [...sections.functional], nonFunctional: [...sections.nonFunctional], businessRules: [...sections.businessRules], integrations: [...sections.integrations] };
  for (const item of items) {
    if (item.status === "dropped" || used.has(item.id)) continue;
    const key = sectionFor(item);
    if (!key) continue;
    out[key].push({ id: "", text: item.text, itemIds: [item.id] });
  }
  return numberLines(out);
}

function lineFrom(item: BrdItem): BrdLine {
  return { id: "", text: item.text, itemIds: [item.id] };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function rulesDraft(input: DraftInput): BrdSections {
  const live = input.items.filter((i) => i.status !== "dropped");
  const pains = live.filter((i) => i.kind === "pain_point");
  const groups = Array.from(new Set(live.map((i) => realTopic(i.groupName)).filter((g): g is string => Boolean(g))));
  const dates = input.meetings.map((m) => m.heldAt.getTime());
  const span = dates.length ? `${formatDate(new Date(Math.min(...dates)))} to ${formatDate(new Date(Math.max(...dates)))}` : "";
  const system = input.client.system?.trim() || "the new system";
  const who = input.client.fullName?.trim() || input.client.name;
  const functional = live.filter((i) => sectionFor(i) === "functional");
  const sections: BrdSections = {
    purpose: cleanStyle(`This document sets out the business requirements for ${system} at ${who}. It was gathered from ${input.meetings.length} ${input.meetings.length === 1 ? "meeting" : "meetings"}${span ? ` held between ${span}` : ""} and is the basis for design, build and acceptance.`),
    scopeIn: groups.length ? groups : ["The processes discussed in the requirement meetings"],
    scopeOut: [],
    stakeholders: input.people.map((p) => ({ name: p.name, role: p.role ?? "", side: p.side })),
    currentProcess: pains.length ? cleanStyle(`Today: ${pains.map((p) => lower(p.text)).join(". ")}.`) : "Not described in the meetings yet.",
    proposedProcess: functional.length ? cleanStyle(`${system} will cover: ${functional.slice(0, 6).map((f) => lower(f.text)).join("; ")}.`) : "To be written once the functional requirements are confirmed.",
    functional: functional.map(lineFrom),
    nonFunctional: live.filter((i) => sectionFor(i) === "nonFunctional").map(lineFrom),
    businessRules: live.filter((i) => sectionFor(i) === "businessRules").map(lineFrom),
    integrations: live.filter((i) => sectionFor(i) === "integrations").map(lineFrom),
    assumptions: [],
    dependencies: live.filter((i) => i.kind === "integration").map((i) => i.text),
    openQuestions: ["Confirm what is out of scope for this phase", ...pains.slice(0, 5).map((p) => `Confirm how this is handled today: ${lower(p.text)}`)],
  };
  return numberLines(sections);
}

export type SourceLabel = { itemId: string; label: string };

/** The draft as plain text: for the documents register, search and Copy. Section numbers follow BRD_SECTIONS. */
export function renderBrdText(sections: BrdSections, meta: { clientName: string; version: number; date: Date; sources: Map<string, string> }): string {
  const out: string[] = [`${meta.clientName}: Business Requirements Document, draft v${meta.version}`, formatDate(meta.date), ""];
  const src = (l: BrdLine) => {
    const s = Array.from(new Set(l.itemIds.map((id) => meta.sources.get(id)).filter(Boolean)));
    return s.length ? ` (source: ${s.join("; ")})` : "";
  };
  BRD_SECTIONS.forEach((sec, i) => {
    out.push(`${i + 1}. ${sec.title}`);
    const v = sections[sec.key];
    if (typeof v === "string") out.push(v || "None recorded.");
    else if (sec.key === "stakeholders") {
      const people = v as BrdSections["stakeholders"];
      out.push(...(people.length ? people.map((p) => `• ${p.name}${p.role ? `, ${p.role}` : ""}${p.side ? ` (${p.side})` : ""}`) : ["None recorded."]));
    } else if (LINE_SECTIONS.some((l) => l.key === sec.key)) {
      const lines = v as BrdLine[];
      out.push(...(lines.length ? lines.map((l) => `${l.id}. ${l.text}${src(l)}`) : ["None recorded."]));
    } else {
      const list = v as string[];
      out.push(...(list.length ? list.map((x) => `• ${x}`) : ["None recorded."]));
    }
    out.push("");
  });
  return cleanStyle(out.join("\n").trim());
}

export function countLines(sections: BrdSections): number {
  return LINE_SECTIONS.reduce((n, { key }) => n + sections[key].length, 0);
}
