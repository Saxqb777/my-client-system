import { beforeAll, describe, expect, it } from "vitest";

// A real database in memory: PGlite runs the migrations in ./drizzle, so this covers the change log end to end.
process.env.DATABASE_URL = "pglite://memory";

describe("automatic updates and undo against a real database", () => {
  let ids: { clientId: string; meetingId: string; milestoneId: string; taskId: string };

  beforeAll(async () => {
    const { getDb } = await import("@/lib/db");
    const { clients, meetings, meetingTranscripts, milestones, tasks } = await import("@/lib/db/schema");
    const { parseTranscriptText } = await import("@/lib/meetings/transcript");
    const { readFileSync } = await import("node:fs");
    const db = await getDb();
    const [client] = await db.insert(clients).values({ name: "Agthia FMS", code: "AGTHIA", phase: "uat", health: "on_track", nextStep: "Close the UAT defect list", phaseStartDate: "2026-09-01", phaseTargetDate: "2026-10-05" }).returning();
    const [ms] = await db.insert(milestones).values({ clientId: client.id, title: "UAT sign off", type: "uat", date: "2026-10-05", originalDate: "2026-10-05" }).returning();
    const [task] = await db.insert(tasks).values({ clientId: client.id, title: "Retest the driver app login issue", dueDate: "2026-09-30" }).returning();
    const parsed = parseTranscriptText(readFileSync("tests/fixtures/agthia-uat-review.txt", "utf8"));
    const [meeting] = await db
      .insert(meetings)
      .values({
        clientId: client.id,
        title: "Agthia FMS UAT sign off review",
        heldAt: new Date("2026-09-29T05:00:00Z"),
        status: "minuted",
        source: "upload",
        processing: "processed",
        matchConfidence: 0.95,
        matchReason: "Title mentions AGTHIA",
        actionItems: [{ text: "Send the defect tracker version four to the steering group", owner: "Saaqib Irfan", due: "2026-09-30", evidence: { quote: "I will send the defect tracker version four to the steering group by Wednesday", at: 115 } }],
        minutes: {
          objective: "UAT sign off review",
          points: [],
          proposal: {
            tasks: [],
            dateChanges: [{ type: "uat", title: "UAT sign off", newDate: "2026-10-08", markDone: false, evidence: { quote: "UAT sign off moves to 8 October", at: 94 } }],
            health: "at_risk",
            healthReason: "Freight cost rounding is a go live blocker",
            healthEvidence: { quote: "Finance flagged the freight cost rounding as a go live blocker", at: 128 },
            nextStep: "Close the four remaining defects and get sign off on 8 October",
            nextStepEvidence: null,
            phaseDates: { startDate: null, targetDate: "2026-10-08", evidence: { quote: "UAT sign off moves to 8 October", at: 94 } },
            risks: [{ text: "Freight cost rounding could block go live", status: "new", evidence: { quote: "Finance flagged the freight cost rounding as a go live blocker", at: 128 } }],
            doneItems: [{ text: "Driver app login issue closed", evidence: { quote: "the driver app login issue is closed from our side", at: 155 } }],
            notesUpdate: "",
            decisions: [],
            summary: "UAT sign off moved to 8 October.",
            openQuestions: [],
            reviewedAt: null,
            autoApplied: null,
          },
        },
      })
      .returning();
    await db.insert(meetingTranscripts).values({ meetingId: meeting.id, fullText: parsed.fullText, segments: parsed.segments, wordCount: parsed.fullText.split(/\s+/).length });
    ids = { clientId: client.id, meetingId: meeting.id, milestoneId: ms.id, taskId: task.id };
  }, 60_000);

  it("applies the clear changes, logs each one, and holds the next step that had no quote", async () => {
    const { runAutoUpdates } = await import("@/lib/meetings/autoUpdate");
    const { changesForMeeting } = await import("@/lib/data/changeLog");
    const { getDb } = await import("@/lib/db");
    const { clients, milestones, tasks, meetings } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const result = await runAutoUpdates(ids.meetingId);
    expect(result.applied).toBe(6);
    expect(result.held).toBe(1);

    const db = await getDb();
    const client = (await db.query.clients.findFirst({ where: eq(clients.id, ids.clientId) }))!;
    expect(client.health).toBe("at_risk");
    expect(client.phaseTargetDate).toBe("2026-10-08");
    expect(client.nextStep).toBe("Close the UAT defect list");
    const ms = (await db.query.milestones.findFirst({ where: eq(milestones.id, ids.milestoneId) }))!;
    expect(ms.date).toBe("2026-10-08");
    expect(ms.dateHistory).toHaveLength(1);
    const task = (await db.query.tasks.findFirst({ where: eq(tasks.id, ids.taskId) }))!;
    expect(task.status).toBe("done");
    const created = await db.query.tasks.findMany({ where: eq(tasks.origin, "meeting") });
    expect(created.map((t) => t.title)).toEqual(["Send the defect tracker version four to the steering group"]);
    expect(created[0].evidenceQuote).toContain("defect tracker version four");

    const rows = await changesForMeeting(ids.meetingId);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.evidenceQuote && r.evidenceAt !== null && r.activityId)).toBe(true);
    const meeting = (await db.query.meetings.findFirst({ where: eq(meetings.id, ids.meetingId) }))!;
    expect(meeting.minutes?.proposal?.autoApplied?.changes).toBe(6);
    expect(meeting.minutes?.proposal?.nextStep).toBe("Close the four remaining defects and get sign off on 8 October");
    expect(meeting.minutes?.proposal?.health).toBeNull();
  });

  it("undoes a health change and restores the old value", async () => {
    const { changesForMeeting, undoChange } = await import("@/lib/data/changeLog");
    const { getDb } = await import("@/lib/db");
    const { clients } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await changesForMeeting(ids.meetingId);
    const health = rows.find((r) => r.field === "health")!;
    const res = await undoChange(health.id);
    expect(res.ok).toBe(true);
    const db = await getDb();
    const client = (await db.query.clients.findFirst({ where: eq(clients.id, ids.clientId) }))!;
    expect(client.health).toBe("on_track");
    const again = await undoChange(health.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toBe("Already undone");
  });

  it("warns when the field moved again after Orbit's change, then forces on request", async () => {
    const { changesForMeeting, undoChange } = await import("@/lib/data/changeLog");
    const { updateMilestone } = await import("@/lib/data/milestones");
    const { getDb } = await import("@/lib/db");
    const { milestones } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await changesForMeeting(ids.meetingId);
    const move = rows.find((r) => r.entityType === "milestone" && r.field === "date")!;
    await updateMilestone(ids.milestoneId, { date: "2026-10-12", reason: "Saaqib moved it again" });
    const first = await undoChange(move.id);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.conflict).toBe(true);
      expect(first.message).toContain("12 Oct 2026");
    }
    const forced = await undoChange(move.id, { force: true });
    expect(forced.ok).toBe(true);
    const db = await getDb();
    const ms = (await db.query.milestones.findFirst({ where: eq(milestones.id, ids.milestoneId) }))!;
    expect(ms.date).toBe("2026-10-05");
  });

  it("undoes a created task by cancelling it, never deleting", async () => {
    const { changesForMeeting, undoChange } = await import("@/lib/data/changeLog");
    const { getDb } = await import("@/lib/db");
    const { tasks } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await changesForMeeting(ids.meetingId);
    const created = rows.find((r) => r.field === "created")!;
    expect((await undoChange(created.id)).ok).toBe(true);
    const db = await getDb();
    const task = (await db.query.tasks.findFirst({ where: eq(tasks.id, created.entityId) }))!;
    expect(task.status).toBe("cancelled");
  });

  it("applies a held item from the Review tab through the same path", async () => {
    const { applyReview } = await import("@/lib/meetings/autoUpdate");
    const { changesForMeeting } = await import("@/lib/data/changeLog");
    const { getDb } = await import("@/lib/db");
    const { clients, meetings } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const res = await applyReview(ids.meetingId, { tasks: [], dateChanges: [], health: false, nextStep: true, phaseDates: false, risks: [], doneItems: [], notes: false });
    expect(res.lines).toEqual(["Next step: Close the four remaining defects and get sign off on 8 October"]);
    const db = await getDb();
    const client = (await db.query.clients.findFirst({ where: eq(clients.id, ids.clientId) }))!;
    expect(client.nextStep).toBe("Close the four remaining defects and get sign off on 8 October");
    const meeting = (await db.query.meetings.findFirst({ where: eq(meetings.id, ids.meetingId) }))!;
    expect(meeting.minutes?.proposal?.nextStep).toBeNull();
    expect(meeting.minutes?.proposal?.reviewedAt).toBeTruthy();
    const rows = await changesForMeeting(ids.meetingId);
    expect(rows.find((r) => r.field === "next_step")?.reason).toBe("Accepted by Saaqib on the Review tab");
  });
});

describe("meetings that ask for a transcript", () => {
  it("never asks for one when the meeting arrived with its transcript", async () => {
    const { getDb } = await import("@/lib/db");
    const { clients, meetings } = await import("@/lib/db/schema");
    const { listMeetingsAwaitingMinutes } = await import("@/lib/data/meetings");
    const db = await getDb();
    const [client] = await db.insert(clients).values({ name: "IDS DASH", code: "IDS", phase: "development", health: "on_track" }).returning();
    const past = new Date("2026-09-20T06:00:00Z");
    await db.insert(meetings).values([
      { clientId: client.id, title: "Sprint review set in Orbit", heldAt: past, status: "held" },
      { clientId: client.id, title: "Uploaded, still drafting", heldAt: past, status: "held", source: "upload", processing: "processing" },
      { clientId: client.id, title: "Uploaded, failed", heldAt: past, status: "held", source: "upload", processing: "failed" },
      { clientId: null, title: "Mac helper, needs a client", heldAt: past, status: "held", source: "mac_helper", processing: "needs_review" },
    ]);
    const titles = (await listMeetingsAwaitingMinutes()).map((m) => m.title);
    expect(titles).toContain("Sprint review set in Orbit");
    expect(titles).not.toContain("Uploaded, still drafting");
    expect(titles).not.toContain("Uploaded, failed");
    expect(titles).not.toContain("Mac helper, needs a client");
  });
});
