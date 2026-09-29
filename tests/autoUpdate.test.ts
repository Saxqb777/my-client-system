import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PendingProposal } from "@/lib/db/schema";
import { clockToSeconds, evidenceGap, evidenceIsClear, quoteInTranscript } from "@/lib/meetings/evidence";
import { planChanges, remainder, type PlanInput } from "@/lib/meetings/autoUpdate";
import { matchClient, type MatchClient } from "@/lib/meetings/match";
import { parseTranscriptText } from "@/lib/meetings/transcript";

const transcript = [
  "[0:04] Me: Good morning. This is the Agthia FMS UAT sign off review.",
  "[1:20] Priya Nathan: We propose UAT sign off moves to 8 October, Thursday, once the four defects are retested.",
  "[1:34] Me: Agreed, UAT sign off moves to 8 October. I will update the plan today.",
  "[1:55] Me: I will send the defect tracker version four to the steering group by Wednesday.",
  "[2:08] Priya Nathan: Finance flagged the freight cost rounding as a go live blocker if it is not fixed.",
  "[2:35] Farid Aziz: The driver app login issue is closed from our side, the test passed this morning.",
].join("\n");

const emptyProposal: PendingProposal = { tasks: [], dateChanges: [], health: null, healthReason: null, nextStep: null, notesUpdate: "", decisions: [], summary: "", openQuestions: [], risks: [], doneItems: [], phaseDates: null };

function input(over: Partial<PlanInput> = {}, proposal: Partial<PendingProposal> = {}): PlanInput {
  return {
    meeting: { id: "m1", title: "Agthia UAT review", otherWork: false, matchConfidence: 0.92, clientId: "agthia" },
    proposal: { ...emptyProposal, ...proposal },
    actionItems: [],
    client: { id: "agthia", name: "Agthia FMS", code: "AGTHIA", owner: "Saaqib", health: "on_track", nextStep: "Close the UAT defect list", phaseStartDate: "2026-09-01", phaseTargetDate: "2026-10-05", notes: null },
    milestones: [{ id: "ms1", title: "UAT sign off", type: "uat", date: "2026-10-05", originalDate: "2026-10-05", status: "upcoming" }],
    openTasks: [{ id: "t1", title: "Share UAT defect tracker v3 with Agthia", clientId: "agthia", dueDate: null, status: "todo", waitingOn: null }, { id: "t2", title: "Retest the driver app login issue", clientId: "agthia", dueDate: "2026-09-30", status: "todo", waitingOn: null }],
    transcript,
    ownerName: "Saaqib",
    ...over,
  };
}

describe("evidence rule", () => {
  it("reads clock strings and seconds", () => {
    expect(clockToSeconds("1:34")).toBe(94);
    expect(clockToSeconds("[1:02:03]")).toBe(3723);
    expect(clockToSeconds("94")).toBe(94);
    expect(clockToSeconds("later")).toBeNull();
  });
  it("finds a verbatim quote whatever the punctuation and case", () => {
    expect(quoteInTranscript("UAT sign off moves to 8 October", transcript)).toBe(true);
    expect(quoteInTranscript("uat SIGN-OFF moves to 8 october.", transcript)).toBe(true);
  });
  it("rejects short quotes and quotes that are not in the transcript", () => {
    expect(quoteInTranscript("8 October", transcript)).toBe(false);
    expect(quoteInTranscript("the go live moves to November", transcript)).toBe(false);
  });
  it("accepts a tidied long quote when six of its words run together in the transcript", () => {
    expect(quoteInTranscript("Finance flagged the freight cost rounding as a blocker for go live", transcript)).toBe(true);
  });
  it("needs a quote in the transcript and a timestamp to be clear", () => {
    expect(evidenceIsClear({ quote: "UAT sign off moves to 8 October", at: 94 }, transcript)).toBe(true);
    expect(evidenceIsClear({ quote: "UAT sign off moves to 8 October", at: null }, transcript)).toBe(false);
    expect(evidenceGap({ quote: "UAT sign off moves to 8 October", at: null }, transcript)).toBe("no timestamp");
    expect(evidenceGap({ quote: "we will see about November", at: 10 }, transcript)).toBe("quote not found in the transcript");
    expect(evidenceGap(null, transcript)).toBe("no quote from the transcript");
  });
});

describe("planChanges", () => {
  it("applies a milestone move with clear evidence and holds one without", () => {
    const planned = planChanges(
      input({}, {
        dateChanges: [
          { type: "uat", title: "UAT sign off", newDate: "2026-10-08", markDone: false, evidence: { quote: "UAT sign off moves to 8 October", at: 94 } },
        ],
      }),
    );
    const move = planned.find((p) => p.kind === "milestone_date");
    expect(move).toBeDefined();
    expect(move!.auto).toBe(true);
    expect(move!.label).toBe("UAT sign off moved: 5 Oct 2026 to 8 Oct 2026");

    const held = planChanges(input({}, { dateChanges: [{ type: "uat", title: "UAT sign off", newDate: "2026-10-08", markDone: false, evidence: null }] }));
    expect(held.find((p) => p.kind === "milestone_date")!.auto).toBe(false);
    expect(held.find((p) => p.kind === "milestone_date")!.gap).toBe("no quote from the transcript");
  });

  it("changes health and next step only with evidence, and skips a value that already holds", () => {
    const planned = planChanges(
      input({}, {
        health: "at_risk",
        healthReason: "Freight cost rounding is a go live blocker",
        healthEvidence: { quote: "Finance flagged the freight cost rounding as a go live blocker", at: 128 },
        nextStep: "Close the UAT defect list",
        nextStepEvidence: { quote: "close the remaining defects", at: 166 },
      }),
    );
    const health = planned.find((p) => p.kind === "client_field" && p.field === "health");
    expect(health?.auto).toBe(true);
    expect(health?.label).toBe("Health: On track to At risk");
    expect(planned.find((p) => p.kind === "client_field" && p.field === "next_step")).toBeUndefined();
  });

  it("never touches a client for Other Work, tasks still come through", () => {
    const planned = planChanges(
      input(
        { meeting: { id: "m2", title: "Fero product sync", otherWork: true, matchConfidence: null, clientId: null }, client: null, milestones: [], openTasks: [] },
        {
          health: "blocked",
          healthEvidence: { quote: "UAT sign off moves to 8 October", at: 94 },
          dateChanges: [{ type: "uat", title: "UAT sign off", newDate: "2026-10-08", markDone: false, evidence: { quote: "UAT sign off moves to 8 October", at: 94 } }],
          risks: [{ text: "Vendor late", status: "new", evidence: { quote: "UAT sign off moves to 8 October", at: 94 } }],
          tasks: [{ title: "Prepare the BRD template draft", dueDate: "2026-10-02", waitingOn: null, priority: "normal", evidence: null }],
        },
      ),
    );
    expect(planned.every((p) => p.kind === "task_create")).toBe(true);
    expect(planned).toHaveLength(1);
  });

  it("holds client changes when the match is below 80 percent even with evidence", () => {
    const planned = planChanges(input({ meeting: { id: "m1", title: "x", otherWork: false, matchConfidence: 0.6, clientId: "agthia" } }, { health: "at_risk", healthEvidence: { quote: "Finance flagged the freight cost rounding", at: 128 } }));
    const health = planned.find((p) => p.kind === "client_field");
    expect(health?.clear).toBe(true);
    expect(health?.auto).toBe(false);
    expect(health?.gap).toBe("client match below 80%");
  });

  it("makes my action items tasks, others waiting on items, and the team a waiting item", () => {
    const planned = planChanges(
      input({
        actionItems: [
          { text: "Send the defect tracker version four to the steering group", owner: "Saaqib Irfan", due: "2026-09-30", evidence: { quote: "I will send the defect tracker version four", at: 115 } },
          { text: "Confirm the UAT sign off with finance", owner: "Priya Nathan", due: null, evidence: null },
          { text: "Fix the freight cost rounding", owner: "Fero", due: null, evidence: null },
        ],
      }),
    );
    const creates = planned.filter((p) => p.kind === "task_create") as Extract<typeof planned[number], { kind: "task_create" }>[];
    expect(creates.map((c) => c.waitingOn)).toEqual([null, "Priya Nathan", "Fero team"]);
    expect(creates.every((c) => c.auto)).toBe(true);
    expect(creates[0].dueDate).toBe("2026-09-30");
  });

  it("updates a similar open task instead of creating a second one", () => {
    const planned = planChanges(input({}, { tasks: [{ title: "Share the UAT defect tracker v4 with Agthia", dueDate: "2026-09-30", waitingOn: null, priority: "high", evidence: null }] }));
    const upd = planned.find((p) => p.kind === "task_update") as Extract<typeof planned[number], { kind: "task_update" }> | undefined;
    expect(upd).toBeDefined();
    expect(upd!.taskId).toBe("t1");
    expect(upd!.dueDate).toBe("2026-09-30");
    expect(planned.some((p) => p.kind === "task_create")).toBe(false);
  });

  it("closes an open task that the meeting reported done, with evidence", () => {
    const planned = planChanges(input({}, { doneItems: [{ text: "Driver app login issue retested and closed", evidence: { quote: "the driver app login issue is closed from our side", at: 155 } }] }));
    const done = planned.find((p) => p.kind === "task_done") as Extract<typeof planned[number], { kind: "task_done" }> | undefined;
    expect(done?.taskId).toBe("t2");
    expect(done?.auto).toBe(true);
  });

  it("keeps only the held items in the remainder", () => {
    const proposal: PendingProposal = {
      ...emptyProposal,
      health: "at_risk",
      healthEvidence: { quote: "Finance flagged the freight cost rounding as a go live blocker", at: 128 },
      dateChanges: [
        { type: "uat", title: "UAT sign off", newDate: "2026-10-08", markDone: false, evidence: { quote: "UAT sign off moves to 8 October", at: 94 } },
        { type: "target", title: null, newDate: "2026-11-01", markDone: false, evidence: null },
      ],
      risks: [{ text: "Freight cost rounding could block go live", status: "new", evidence: null }],
    };
    const planned = planChanges(input({ milestones: [{ id: "ms1", title: "UAT sign off", type: "uat", date: "2026-10-05", originalDate: "2026-10-05", status: "upcoming" }, { id: "ms2", title: "Go live target", type: "target", date: "2026-10-20", originalDate: "2026-10-20", status: "upcoming" }] }, proposal));
    const rest = remainder(proposal, planned, (p) => p.auto);
    expect(rest.health).toBeNull();
    expect(rest.dateChanges).toHaveLength(1);
    expect(rest.dateChanges[0].type).toBe("target");
    expect(rest.risks).toHaveLength(1);
  });
});

describe("Phase 2 fixtures", () => {
  const clients: MatchClient[] = [
    { id: "agthia", code: "AGTHIA", name: "Agthia FMS", aliases: ["FMCT"], system: "FMS", fullName: "Agthia Group PJSC", people: [] },
    { id: "ids", code: "IDS", name: "IDS DASH", aliases: ["Etihad Drug"], system: "DASH (Fero dispatch and delivery management)", fullName: "IDS (Al Etihad Drug Store)", people: [] },
    { id: "adso", code: "ADSO", name: "ADSO TMS and Clearance", aliases: ["AdsoFz"], system: "TAME (TMS)", fullName: "ADSO LLC, Jebel Ali Free Zone, Dubai", people: [] },
  ];
  const cases: [string, string, string | null][] = [
    ["agthia-uat-review.txt", "Agthia FMS UAT sign off review", "agthia"],
    ["ids-sprint-demo.txt", "IDS DASH sprint 4 demo", "ids"],
    ["adso-sit-planning.txt", "ADSO TMS SIT cycle 2 planning", "adso"],
    ["fero-product-sync.txt", "Fero product sync", null],
  ];
  for (const [file, title, expected] of cases) {
    it(`${file} parses and matches ${expected ?? "no client"}`, () => {
      const t = parseTranscriptText(readFileSync(`tests/fixtures/${file}`, "utf8"));
      expect(t.segments.length).toBeGreaterThan(4);
      expect(t.segments[0].start).toBeLessThan(10);
      const r = matchClient({ calendarTitle: title, attendees: [], text: t.fullText }, clients);
      if (expected) {
        expect(r.clientId).toBe(expected);
        expect(r.confidence).toBeGreaterThanOrEqual(0.8);
      } else {
        expect(r.clientId === null || r.confidence < 0.8).toBe(true);
      }
    });
  }
});
