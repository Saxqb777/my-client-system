import { eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activities,
  clients,
  documents,
  insights,
  meetings,
  milestones,
  people,
  tasks,
  type ActivityType,
  type Health,
  type MilestoneType,
  type TaskPriority,
} from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/core/constants";
import { addDaysISO, todayISO } from "@/lib/core/dates";
import { setSetting } from "@/lib/data/settings";

/**
 * Demo content for exploring Orbit. Everything inserted here carries is_demo = true,
 * and the eight clients carry demo_status = true so Clear demo data can reset their status fields
 * while keeping the client records themselves.
 */

type SeedClient = {
  code: string;
  name: string;
  fullName?: string;
  system?: string;
  aliases?: string[];
  phase: string;
  health: Health;
  nextStep: string;
  start: number; // day offsets from today
  target: number;
  targetOriginal?: number;
  color: string;
  people: { name: string; role: string; side?: "client" | "vendor" | "internal"; primary?: boolean; email?: string }[];
  milestones: { title: string; type: MilestoneType; date: number; original?: number; done?: boolean }[];
  activities: { daysAgo: number; hour?: number; type: ActivityType; title: string; body?: string; source?: "app" | "quick_log" | "paste" }[];
  tasks: { title: string; due?: number; waitingOn?: string; waitingSince?: number; priority?: TaskPriority; status?: "todo" | "in_progress" | "waiting" | "done"; details?: string }[];
};

const SEED: SeedClient[] = [
  {
    code: "AGTHIA",
    name: "Agthia FMS",
    fullName: "Agthia Group",
    system: "FMS",
    aliases: ["Agthia"],
    phase: "uat",
    health: "on_track",
    nextStep: "Close the UAT defect list and collect sign off from Khalid",
    start: -21,
    target: 10,
    targetOriginal: 3,
    color: "174",
    people: [
      { name: "Khalid Al Mansoori", role: "IT Manager", primary: true, email: "khalid@example.com" },
      { name: "Priya Nair", role: "Fleet Operations Lead" },
      { name: "Omar Siddiqui", role: "Vendor PM", side: "vendor" },
    ],
    milestones: [
      { title: "UAT start", type: "uat", date: -21, done: true },
      { title: "UAT sign off", type: "uat", date: 10, original: 3 },
      { title: "Go live", type: "go_live", date: 31 },
    ],
    activities: [
      { daysAgo: 13, type: "meeting", title: "UAT kick off held with fleet operations team", body: "12 testers onboarded. Test cases walkthrough completed." },
      { daysAgo: 9, type: "update", title: "UAT cycle 1 completed: 22 defects logged, 6 high" },
      { daysAgo: 6, type: "email", title: "Sent UAT defect tracker v2 to Khalid and Priya" },
      { daysAgo: 4, type: "issue", title: "Fuel card sync defect reopened after retest" },
      { daysAgo: 2, type: "decision", title: "UAT sign off moved to allow one more retest cycle", body: "Agreed with Khalid. One week extension." , source: "quick_log" },
      { daysAgo: 1, type: "whatsapp", title: "Priya confirmed retest team availability for Sunday" },
    ],
    tasks: [
      { title: "Share UAT defect tracker v3 with Agthia", due: 1, priority: "high" },
      { title: "UAT sign off from Khalid", waitingOn: "Khalid Al Mansoori", waitingSince: -2 },
      { title: "Prepare go live checklist draft", due: 8 },
    ],
  },
  {
    code: "ADSO",
    name: "ADSO TMS",
    system: "TMS",
    aliases: ["ADSO"],
    phase: "sit",
    health: "at_risk",
    nextStep: "Fix WMS interface defects before SIT cycle 2",
    start: -14,
    target: 6,
    color: "262",
    people: [
      { name: "Mariam Al Hosani", role: "Project Sponsor", primary: true },
      { name: "Rahul Menon", role: "Integration Lead", side: "vendor" },
    ],
    milestones: [
      { title: "SIT cycle 1", type: "sit", date: -7, done: true },
      { title: "SIT cycle 2", type: "sit", date: 6 },
      { title: "UAT start", type: "uat", date: 15, original: 10 },
      { title: "Go live", type: "go_live", date: 45 },
    ],
    activities: [
      { daysAgo: 12, type: "meeting", title: "SIT planning session with vendor integration team" },
      { daysAgo: 7, type: "update", title: "SIT cycle 1 closed: 14 defects, 3 critical on WMS interface" },
      { daysAgo: 5, type: "issue", title: "WMS order status callback failing for split shipments", body: "Vendor investigating. Root cause in message sequencing." },
      { daysAgo: 3, type: "email", title: "Escalated WMS defects to Rahul with retest deadline" },
      { daysAgo: 1, type: "call", title: "Call with Mariam: UAT start pushed by one week" , source: "quick_log" },
    ],
    tasks: [
      { title: "Prepare SIT cycle 2 test cases", due: 3, priority: "high", status: "in_progress" },
      { title: "WMS interface defect fixes", waitingOn: "Rahul Menon", waitingSince: -4, priority: "urgent" },
      { title: "Send revised UAT plan to Mariam", due: 2 },
    ],
  },
  {
    code: "IDS",
    name: "IDS DASH",
    fullName: "Al Etihad Drug Store",
    system: "DASH",
    aliases: ["Al Etihad", "Etihad Drug Store", "IDS Dashboard"],
    phase: "development",
    health: "on_track",
    nextStep: "Review sprint 4 demo and confirm KPI definitions",
    start: -35,
    target: 20,
    color: "330",
    people: [
      { name: "Fatima Al Zaabi", role: "Head of Commercial", primary: true },
      { name: "Joseph Thomas", role: "IT Business Partner" },
      { name: "Sanjay Rao", role: "BI Developer", side: "vendor" },
    ],
    milestones: [
      { title: "Sprint 4 demo", type: "other", date: 2 },
      { title: "Development complete", type: "target", date: 20 },
      { title: "SIT start", type: "sit", date: 24 },
    ],
    activities: [
      { daysAgo: 10, type: "meeting", title: "Sprint 3 demo: sales and stock dashboards accepted with two change requests" },
      { daysAgo: 8, type: "email", title: "Sent KPI definition sheet to Fatima for confirmation" },
      { daysAgo: 6, type: "update", title: "Change requests CR 07 and CR 08 estimated at 3 days" },
      { daysAgo: 2, type: "whatsapp", title: "Joseph asked for sample data extract timeline" },
    ],
    tasks: [
      { title: "Confirm KPI definitions with Fatima", due: 0, priority: "high" },
      { title: "Sample data extract from IDS IT", waitingOn: "Joseph Thomas", waitingSince: -6 },
      { title: "Book sprint 4 demo room and invite", due: 1, status: "done" },
    ],
  },
  {
    code: "ADFH",
    name: "ADFH OMS",
    fullName: "Abu Dhabi Food Hub",
    system: "OMS",
    aliases: ["Food Hub", "ADFH"],
    phase: "requirements",
    health: "at_risk",
    nextStep: "BRD session initiation and closure",
    start: -10,
    target: 27,
    targetOriginal: 20,
    color: "42",
    people: [
      { name: "Saeed Al Marzouqi", role: "Operations Director", primary: true },
      { name: "Noura Al Ketbi", role: "IT Projects Manager" },
      { name: "Hani Farouk", role: "MAQTA Integration Contact", side: "client" },
    ],
    milestones: [
      { title: "BRD start", type: "other", date: -3, original: -10, done: true },
      { title: "Integration workshop: MAQTA", type: "other", date: -5, done: true },
      { title: "Integration workshop: SENYAR", type: "other", date: -3, done: true },
      { title: "Integration workshop: Oracle Fusion", type: "other", date: -1, done: true },
      { title: "BRD sign off", type: "target", date: 27, original: 20 },
    ],
    activities: [
      { daysAgo: 9, type: "decision", title: "BRD start delayed by one week: client SME availability" },
      { daysAgo: 5, type: "meeting", title: "Integration discussion completed: MAQTA", body: "Manifest and gate pass flows agreed at high level." },
      { daysAgo: 3, type: "meeting", title: "Integration discussion completed: SENYAR" },
      { daysAgo: 1, type: "meeting", title: "Integration discussion completed: Oracle Fusion", body: "Finance posting scope to be confirmed by Noura." },
      { daysAgo: 1, hour: 17, type: "update", title: "More integration sessions to follow next week", source: "quick_log" },
    ],
    tasks: [
      { title: "Schedule BRD session 1 with operations team", due: 2, priority: "high" },
      { title: "Integration contact list from ADFH IT", waitingOn: "Noura Al Ketbi", waitingSince: -3 },
      { title: "Draft BRD structure and section owners", due: 4, status: "in_progress" },
    ],
  },
  {
    code: "RSA",
    name: "RSA Talke",
    aliases: ["RSA", "Talke"],
    phase: "go_live",
    health: "on_track",
    nextStep: "Go live readiness checklist sign off",
    start: -7,
    target: 4,
    color: "200",
    people: [
      { name: "Daniel Weber", role: "Site Manager", primary: true },
      { name: "Ayesha Khan", role: "Warehouse Supervisor" },
    ],
    milestones: [
      { title: "Data migration dry run", type: "system", date: -2, done: true },
      { title: "Go live", type: "go_live", date: 4 },
      { title: "Hypercare end", type: "other", date: 18 },
    ],
    activities: [
      { daysAgo: 6, type: "meeting", title: "Cutover plan approved by Daniel" },
      { daysAgo: 2, type: "delivery", title: "Data migration dry run passed with zero variances" },
      { daysAgo: 1, type: "email", title: "Sent go live readiness checklist for sign off" },
    ],
    tasks: [
      { title: "Send cutover communication to warehouse leads", due: 1, priority: "high" },
      { title: "Confirm hypercare roster with vendor", due: 3 },
    ],
  },
  {
    code: "NL",
    name: "NorthLadder",
    aliases: ["North Ladder"],
    phase: "discovery",
    health: "on_track",
    nextStep: "Send proposal with scope options",
    start: -5,
    target: 12,
    color: "292",
    people: [{ name: "Pierre Dubois", role: "Head of Operations", primary: true }],
    milestones: [{ title: "Proposal due", type: "target", date: 12 }],
    activities: [
      { daysAgo: 5, type: "call", title: "Intro call with Pierre: device trade in workflow pain points" },
      { daysAgo: 2, type: "update", title: "Drafted discovery notes and open questions" },
    ],
    tasks: [
      { title: "Draft scope proposal with two options", due: 4, status: "in_progress" },
      { title: "Send follow up questions to Pierre", due: 1 },
    ],
  },
  {
    code: "EDGE",
    name: "EDGE Logistics Platform",
    aliases: ["EDGE Logistics", "EDGE"],
    phase: "uat",
    health: "blocked",
    nextStep: "Get SSO access resolved with EDGE IT security",
    start: -28,
    target: 14,
    targetOriginal: 0,
    color: "16",
    people: [
      { name: "Ahmed Al Shamsi", role: "Program Manager", primary: true },
      { name: "Lina Haddad", role: "IT Security" },
    ],
    milestones: [
      { title: "UAT sign off", type: "uat", date: 14, original: 0 },
      { title: "Go live", type: "go_live", date: 35, original: 21 },
    ],
    activities: [
      { daysAgo: 14, type: "meeting", title: "UAT kick off with EDGE operations" },
      { daysAgo: 9, type: "issue", title: "UAT blocked: SSO access for test users pending security approval" },
      { daysAgo: 5, type: "email", title: "Escalated SSO ticket to Ahmed with impact on go live" },
      { daysAgo: 2, type: "whatsapp", title: "Followed up with Ahmed on SSO ticket, still with security" },
    ],
    tasks: [
      { title: "SSO access approval", waitingOn: "Lina Haddad", waitingSince: -9, priority: "urgent" },
      { title: "Escalate SSO ticket to PMO", due: 0, priority: "high" },
      { title: "Re baseline UAT and go live dates with Ahmed", due: 3 },
    ],
  },
  {
    code: "ALFOAH",
    name: "Al Foah Gate System",
    aliases: ["Al Foah", "Foah", "Gate System"],
    phase: "hypercare",
    health: "on_track",
    nextStep: "Close hypercare and hand over to support",
    start: -12,
    target: 9,
    color: "150",
    people: [
      { name: "Hamad Al Dhaheri", role: "Plant Manager", primary: true },
      { name: "Vikram Iyer", role: "Support Lead", side: "internal" },
    ],
    milestones: [
      { title: "Go live", type: "go_live", date: -12, done: true },
      { title: "Hypercare end", type: "other", date: 9 },
      { title: "Support handover", type: "other", date: 10 },
    ],
    activities: [
      { daysAgo: 12, type: "delivery", title: "Go live completed at Gate 2 and Gate 3" },
      { daysAgo: 5, type: "update", title: "Hypercare week 1: 3 minor issues, all closed" },
      { daysAgo: 1, type: "email", title: "Shared hypercare status report with Hamad" },
    ],
    tasks: [
      { title: "Prepare support handover document", due: 5, status: "in_progress" },
      { title: "Collect hypercare sign off from Hamad", due: 9 },
    ],
  },
];

const CODES = SEED.map((c) => c.code);

function at(daysAgo: number, hour = 10 + (daysAgo % 6)): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour - 4, (daysAgo * 7) % 60, 0, 0); // Dubai is UTC+4
  return d;
}

export async function seedDemoData(): Promise<{ inserted: number; skipped: string[] }> {
  const db = await getDb();
  const today = todayISO();
  const day = (offset: number) => addDaysISO(today, offset);
  let inserted = 0;
  const skipped: string[] = [];

  const existing = await db.query.clients.findMany({ where: inArray(clients.code, CODES) });
  const byCode = new Map(existing.map((c) => [c.code, c]));

  for (const [i, s] of SEED.entries()) {
    const values = {
      name: s.name,
      code: s.code,
      fullName: s.fullName ?? null,
      system: s.system ?? null,
      aliases: s.aliases ?? [],
      owner: "Saaqib",
      phase: s.phase,
      health: s.health,
      nextStep: s.nextStep,
      phaseStartDate: day(s.start),
      phaseTargetDate: day(s.target),
      phaseTargetOriginal: day(s.targetOriginal ?? s.target),
      color: s.color,
      sortOrder: i,
      demoStatus: true,
      archivedAt: null,
    };
    let client = byCode.get(s.code);
    if (client && !client.demoStatus) {
      // A real client already uses this code. Demo data never touches real work.
      skipped.push(s.code);
      continue;
    }
    if (!client) {
      [client] = await db.insert(clients).values(values).returning();
      inserted++;
    } else {
      [client] = await db.update(clients).set(values).where(eq(clients.id, client.id)).returning();
    }
    const clientId = client.id;

    // Replace previous demo rows for this client so loading twice does not duplicate.
    await db.delete(people).where(eq(people.clientId, clientId));
    await db.delete(milestones).where(eq(milestones.clientId, clientId));
    await db.delete(activities).where(eq(activities.clientId, clientId));
    await db.delete(tasks).where(eq(tasks.clientId, clientId));

    if (s.people.length) {
      await db.insert(people).values(
        s.people.map((p) => ({
          clientId,
          name: p.name,
          role: p.role,
          side: p.side ?? "client",
          isPrimary: Boolean(p.primary),
          email: p.email ?? null,
          isDemo: true,
        })),
      );
      inserted += s.people.length;
    }
    if (s.milestones.length) {
      await db.insert(milestones).values(
        s.milestones.map((m) => ({
          clientId,
          title: m.title,
          type: m.type,
          date: day(m.date),
          originalDate: day(m.original ?? m.date),
          dateHistory:
            m.original !== undefined && m.original !== m.date
              ? [{ from: day(m.original), to: day(m.date), at: at(Math.max(1, Math.abs(m.date - m.original))).toISOString(), reason: "Demo: date moved" }]
              : [],
          status: m.done ? ("done" as const) : ("upcoming" as const),
          completedAt: m.done ? at(Math.max(0, -m.date)) : null,
          isDemo: true,
        })),
      );
      inserted += s.milestones.length;
    }
    if (s.activities.length) {
      await db.insert(activities).values(
        s.activities.map((a) => ({
          clientId,
          type: a.type,
          title: a.title,
          body: a.body ?? null,
          occurredAt: at(a.daysAgo, a.hour),
          source: a.source ?? "app",
          isDemo: true,
        })),
      );
      inserted += s.activities.length;
    }
    if (s.tasks.length) {
      await db.insert(tasks).values(
        s.tasks.map((t) => {
          const status = t.status ?? (t.waitingOn ? "waiting" : "todo");
          return {
            clientId,
            title: t.title,
            details: t.details ?? null,
            status,
            priority: t.priority ?? "normal",
            dueDate: t.due !== undefined ? day(t.due) : null,
            waitingOn: t.waitingOn ?? null,
            waitingSince: t.waitingOn ? day(t.waitingSince ?? 0) : null,
            completedAt: status === "done" ? at(1) : null,
            isDemo: true,
          };
        }),
      );
      inserted += s.tasks.length;
    }
  }

  if (skipped.length) console.warn(`Demo data skipped real clients: ${skipped.join(", ")}`);
  await setSetting(SETTINGS_KEYS.demoSeededAt, new Date().toISOString());
  return { inserted, skipped };
}

export async function clearDemoData(): Promise<{ removed: number }> {
  const db = await getDb();
  let removed = 0;
  const count = <T extends { id: string }>(rows: T[]) => (removed += rows.length);

  count(await db.delete(tasks).where(eq(tasks.isDemo, true)).returning({ id: tasks.id }));
  count(await db.delete(activities).where(eq(activities.isDemo, true)).returning({ id: activities.id }));
  count(await db.delete(milestones).where(eq(milestones.isDemo, true)).returning({ id: milestones.id }));
  count(await db.delete(people).where(eq(people.isDemo, true)).returning({ id: people.id }));
  count(await db.delete(meetings).where(eq(meetings.isDemo, true)).returning({ id: meetings.id }));
  count(await db.delete(documents).where(eq(documents.isDemo, true)).returning({ id: documents.id }));
  count(await db.delete(insights).where(isNotNull(insights.id)).returning({ id: insights.id }));

  const reset = await db
    .update(clients)
    .set({
      phase: "discovery",
      health: "on_track",
      nextStep: null,
      phaseStartDate: null,
      phaseTargetDate: null,
      phaseTargetOriginal: null,
      demoStatus: false,
    })
    .where(eq(clients.demoStatus, true))
    .returning({ id: clients.id });
  removed += reset.length;

  await setSetting(SETTINGS_KEYS.demoSeededAt, null);
  return { removed };
}

export async function isDemoLoaded(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query.clients.findMany({ where: eq(clients.demoStatus, true), columns: { id: true } });
  return rows.length > 0;
}
