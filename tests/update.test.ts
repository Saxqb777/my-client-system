import { describe, expect, it } from "vitest";
import { mapUpdate, meetingTime, replaceHealthReason, type UpdateContext } from "@/lib/import/mapUpdate";
import { updateExportSchema } from "@/lib/import/updateSchema";

const ctx: UpdateContext = {
  today: "2026-09-28",
  client: {
    id: "c1",
    name: "ADFH OMS",
    code: "ADFH",
    system: "Operations Management System (OMS)",
    owner: "Saaqib",
    phase: "discovery",
    health: "on_track",
    nextStep: "Run the sessions",
    phaseStartDate: "2026-09-28",
    phaseTargetDate: "2026-10-01",
    phaseTargetOriginal: "2026-10-01",
    notes: "Demo platform at adfh.feroai.com.\n\nWhy at risk: old reason",
  },
  milestones: [
    { id: "m1", title: "BRD sessions close", type: "target", date: "2026-10-01", originalDate: "2026-08-17", status: "upcoming" },
    { id: "m2", title: "Go live", type: "go_live", date: "2026-10-21", originalDate: "2026-10-01", status: "upcoming" },
  ],
  openTasks: [{ id: "t1", title: "Receive confirmation on whether Maximo is used for assets and maintenance" }],
  recentActivities: [{ date: "2026-09-28", title: "BRD Session 1 held on configurations" }],
  riskDocumentId: "d1",
  moduleDocumentIds: [],
};

const update = updateExportSchema.parse({
  client_code: "ADFH",
  update_date: "2026-09-28",
  client: { phase: "requirements", health: "at_risk", health_reason: "BRD completion moved out a week", next_step: "Run BRD Session 2", phase_start_date: "2026-09-28", phase_target_date: "2026-10-09", phase_target_original_date: "2026-10-01" },
  activities: [
    { date: "2026-09-28", type: "meeting", title: "BRD Session 1 held on configurations", detail: "Held 9:03 to 10:07 am. Walked the zone configuration." },
    { date: "2026-09-28", type: "decision", title: "Maximo confirmed as inventory only", detail: "Closes the open question." },
    { date: "2026-09-28", type: "update", title: "BRD completion moved to end of next week", detail: "Targeted for 9 October." },
  ],
  meetings: [
    {
      date: "2026-09-28",
      title: "BRD Session 1: Configurations",
      attendees: ["Shubh Jani", "Saaqib Irfan"],
      summary: "First BRD session on configurations.",
      decisions: ["A leasable unit level is required below building", "Maximo is inventory only"],
      action_items: [
        { text: "Share the unit layouts with shop names", owner: "Mohammad Al Sibaei", due: null, done: false },
        { text: "Prepare a working sandbox environment", owner: "Fero", due: null, done: false },
      ],
    },
  ],
  tasks: [
    { title: "Prepare a working sandbox environment ahead of the next session", status: "todo", priority: "high", due_date: "2026-09-29", waiting_on: null, waiting_since: null },
    { title: "Receive the unit layouts with shop names and planned square meters", status: "waiting", priority: "urgent", due_date: null, waiting_on: "Mohammad Al Sibaei", waiting_since: "2026-09-28" },
    { title: "Chase Saaqib for the plan", status: "waiting", priority: "normal", due_date: null, waiting_on: "Saaqib", waiting_since: "2026-09-28" },
  ],
  tasks_closed: [{ title: "Receive confirmation on whether Maximo is used for assets", closed_on: "2026-09-28", outcome: "Inventory only." }],
  documents: [
    { title: "ADFH Fero BRD S1 MOM 28Sep", type: "mom", status: "draft", date: "2026-09-28", where: "Local" },
    { title: "Pavilion map v2", type: "other", status: "shared", date: "2026-09-28", where: "Email" },
  ],
  risks: [{ risk: "A hierarchy level was missing", impact: "Rework", mitigation: "Onsite day", owner: "Fero" }],
  open_questions: ["Is occupancy measured against constructed area or leasable area"],
  module_progress: { module: "Configurations", sessions: ["S1", "S2"], sessions_held: ["S1"], percent_complete: 20, ready_for_brd: false, covered: ["Zones"], partly_covered: ["Docks"], not_covered: ["Units"], notes: "S1 covered zones only." },
});

describe("mapUpdate", () => {
  const m = mapUpdate(update, ctx);

  it("patches only what changed and writes the app's change lines", () => {
    expect(m.clientPatch.phase).toBe("requirements");
    expect(m.clientPatch.health).toBe("at_risk");
    expect(m.clientPatch.nextStep).toBe("Run BRD Session 2");
    expect(m.clientPatch.phaseTargetDate).toBe("2026-10-09");
    expect(m.clientPatch.phaseStartDate).toBeUndefined();
    expect(m.clientPatch.phaseTargetOriginal).toBeUndefined();
    expect(m.clientPatch.notes).toBe("Demo platform at adfh.feroai.com.\n\nWhy at risk: BRD completion moved out a week");
    const titles = m.activities.map((a) => a.title);
    expect(titles).toContain("Phase: Discovery to BRD");
    expect(titles).toContain("Health: On track to At risk");
    expect(titles).toContain("Next step: Run BRD Session 2");
    expect(titles).toContain("Target date: 1 Oct 2026 to 9 Oct 2026");
  });

  it("moves the target milestone that sat on the old date", () => {
    expect(m.milestoneMoves).toHaveLength(1);
    expect(m.milestoneMoves[0]).toMatchObject({ id: "m1", from: "2026-10-01", to: "2026-10-09" });
    expect(m.milestoneMoves[0].entry.reason).toBe("BRD completion moved to end of next week");
    expect(m.activities.some((a) => a.title.startsWith("BRD sessions close moved: 1 Oct 2026 to 9 Oct 2026"))).toBe(true);
  });

  it("skips an activity already on the timeline and links the meeting one", () => {
    expect(m.activities.filter((a) => a.title === "BRD Session 1 held on configurations")).toHaveLength(0);
    expect(m.notes.some((n) => n.includes("repeats"))).toBe(true);
    expect(m.activities.find((a) => a.title === "Maximo confirmed as inventory only")?.type).toBe("decision");
  });

  it("saves the meeting as standard minutes with its document", () => {
    const mt = m.meetings[0];
    expect(mt.heldAt.toISOString()).toBe("2026-09-28T05:03:00.000Z");
    expect(mt.minutes.objective).toBe("First BRD session on configurations.");
    expect(mt.minutes.points).toHaveLength(2);
    expect(mt.mom).toContain("ADFH × Fero | BRD Session 1: Configurations");
    expect(mt.mom).toContain("1. Share the unit layouts with shop names (Mohammad Al Sibaei)");
    expect(mt.document).toEqual({ title: "ADFH Fero BRD S1 MOM 28Sep", tags: ["mom", "draft"] });
    expect(m.documents.map((d) => d.title)).toContain("Pavilion map v2");
    expect(m.documents.map((d) => d.title)).not.toContain("ADFH Fero BRD S1 MOM 28Sep");
  });

  it("maps tasks, links them to the meeting and closes the named task", () => {
    expect(m.tasks).toHaveLength(3);
    expect(m.tasks[0]).toMatchObject({ status: "todo", priority: "high", dueDate: "2026-09-29", fromMeeting: true });
    expect(m.tasks[1]).toMatchObject({ status: "waiting", waitingOn: "Mohammad Al Sibaei", waitingSince: "2026-09-28", fromMeeting: true });
    expect(m.tasks[2]).toMatchObject({ status: "todo", waitingOn: null, fromMeeting: false });
    expect(m.closeTasks).toEqual([{ id: "t1", title: ctx.openTasks[0].title, outcome: "Inventory only.", closedOn: "2026-09-28" }]);
  });

  it("appends risks and writes the module progress document", () => {
    expect(m.riskAppend?.documentId).toBe("d1");
    expect(m.riskAppend?.text.startsWith("Update 28 Sep 2026")).toBe(true);
    expect(m.riskAppend?.text).toContain("• A hierarchy level was missing\n  Impact: Rework");
    const prog = m.documents.find((d) => d.tags.includes("progress"));
    expect(prog?.title).toBe("ADFH OMS: Configurations module progress");
    expect(prog?.content).toContain("20% complete. Ready for BRD: no.");
    expect(prog?.content).toContain("Not covered\n\n• Units");
  });
});

describe("helpers", () => {
  it("reads a meeting time out of the activity detail", () => {
    expect(meetingTime("2026-09-28", "Held 9:03 to 10:07 am.").toISOString()).toBe("2026-09-28T05:03:00.000Z");
    expect(meetingTime("2026-09-28", "Ran 2:30 pm for an hour").toISOString()).toBe("2026-09-28T10:30:00.000Z");
    expect(meetingTime("2026-09-28", "no time here").toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("replaces or adds the health reason paragraph", () => {
    expect(replaceHealthReason("Facts.\n\nWhy on track: fine", "at_risk", "slipped")).toBe("Facts.\n\nWhy at risk: slipped");
    expect(replaceHealthReason("Facts.", "blocked", "no access")).toBe("Facts.\n\nWhy blocked: no access");
    expect(replaceHealthReason(null, "on_track", "all good")).toBe("Why on track: all good");
  });
});
