import { describe, expect, it } from "vitest";
import type { ReportRow } from "@/lib/db/schema";
import { buildRows, cell, mergeRows, renderTable, riskFragments, weekLabel, type ClientWeek, type WeekContext } from "@/lib/friday/build";

function client(over: Partial<ClientWeek["client"]> = {}): ClientWeek["client"] {
  return { id: "c1", name: "Agthia FMS", code: "AGTHIA", owner: "Saaqib", health: "on_track", nextStep: "Close the UAT defect list", phase: "uat", phaseStartDate: "2026-09-01", phaseTargetDate: "2026-10-08", phaseTargetOriginal: "2026-10-05", notes: null, ...over };
}

const week: ClientWeek = {
  client: client(),
  meetings: [{ title: "UAT sign off review", heldAt: "2026-09-29T05:00:00.000Z", summary: "UAT sign off moved to 8 October after four open defects", decisions: [] }],
  activities: [{ type: "delivery", title: "Done: Share UAT defect tracker v3", occurredAt: "2026-09-28T08:00:00.000Z" }],
  doneTasks: [{ title: "Retest the driver app login issue", completedAt: "2026-09-29T09:00:00.000Z" }],
  dueNextWeek: [{ title: "Send defect tracker v4 to the steering group", dueDate: "2026-10-07", waitingOn: null }, { title: "Confirm sign off date", dueDate: "2026-10-08", waitingOn: "Priya Nathan" }],
  milestones: [{ title: "UAT sign off", type: "uat", date: "2026-10-08", originalDate: "2026-10-05", status: "upcoming", movedThisWeek: { from: "2026-10-05", to: "2026-10-08", reason: "Four defects to retest" } }],
  risks: ["Freight cost rounding flagged as a go live blocker"],
};

const ctx: WeekContext = { weekStart: "2026-09-25", weekEnd: "2026-10-01", today: "2026-09-30", clients: [week] };

describe("Friday pack rows", () => {
  it("writes the seven columns from the week's material", () => {
    const [row] = buildRows(ctx);
    expect(row.client).toBe("Agthia FMS");
    expect(row.owner).toBe("Saaqib");
    expect(row.done).toContain("UAT sign off moved to 8 October after four open defects");
    expect(row.done).toContain("Share UAT defect tracker v3");
    expect(row.done).toContain("Retest the driver app login issue");
    expect(row.risk).toContain("UAT sign off moved to 8 Oct 2026, 3 days behind plan: Four defects to retest");
    expect(row.risk).toContain("Freight cost rounding");
    expect(row.next).toContain("Close the UAT defect list");
    expect(row.next).toContain("Chase Priya Nathan: Confirm sign off date");
    expect(row.startDate).toBe("1 Sep 2026");
    expect(row.targetDate).toBe("8 Oct 2026");
  });

  it("reads None when nothing is at risk and names overdue dates when they are", () => {
    const quiet: ClientWeek = { ...week, client: client({ health: "on_track" }), milestones: [{ title: "Go live", type: "go_live", date: "2026-10-20", originalDate: "2026-10-20", status: "upcoming", movedThisWeek: null }], risks: [] };
    expect(buildRows({ ...ctx, clients: [quiet] })[0].risk).toBe("None");
    const late: ClientWeek = { ...quiet, client: client({ health: "at_risk", notes: "Why at risk: vendor fix pending" }), milestones: [{ title: "SIT cycle 2", type: "sit", date: "2026-09-28", originalDate: "2026-09-28", status: "upcoming", movedThisWeek: null }] };
    expect(riskFragments(late, "2026-09-30")).toEqual(["At risk: vendor fix pending", "SIT cycle 2 overdue since 28 Sep 2026"]);
  });

  it("never writes a dash and trims long cells cleanly", () => {
    const text = cell(["Sign-off agreed — vendor to follow-up", "x".repeat(400)]);
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
    expect(text.length).toBeLessThanOrEqual(260);
  });

  it("keeps hand edited cells on regenerate and drops them on reset", () => {
    const previous: ReportRow[] = [{ clientId: "c1", client: "Agthia FMS", owner: "Saaqib", done: "My own words", risk: "None", next: "x", startDate: "", targetDate: "", edited: ["done"] }];
    const fresh = buildRows(ctx);
    const kept = mergeRows(previous, fresh, false)[0];
    expect(kept.done).toBe("My own words");
    expect(kept.risk).toBe(fresh[0].risk);
    expect(kept.edited).toEqual(["done"]);
    const reset = mergeRows(previous, fresh, true)[0];
    expect(reset.done).toBe(fresh[0].done);
    expect(reset.edited).toEqual([]);
  });

  it("drops clients that left and adds new ones fresh", () => {
    const previous: ReportRow[] = [{ clientId: "gone", client: "Old", owner: "Saaqib", done: "", risk: "", next: "", startDate: "", targetDate: "", edited: ["done"] }];
    const merged = mergeRows(previous, buildRows(ctx));
    expect(merged.map((r) => r.clientId)).toEqual(["c1"]);
  });

  it("renders a tab separated table with the fixed header", () => {
    const text = renderTable(buildRows(ctx));
    const [header, first] = text.split("\n");
    expect(header).toBe("Client\tOwner\tDone this week\tRisk / Delay\tNext week action\tStart date\tTarget date");
    expect(first.split("\t")).toHaveLength(7);
    expect(first.startsWith("Agthia FMS\tSaaqib\t")).toBe(true);
  });

  it("labels the week", () => {
    expect(weekLabel("2026-09-25", "2026-10-01")).toBe("25 Sep to 1 Oct 2026");
    expect(weekLabel("2026-12-26", "2027-01-01")).toBe("26 Dec 2026 to 1 Jan 2027");
  });
});
