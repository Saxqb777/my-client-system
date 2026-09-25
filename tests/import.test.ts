import { describe, expect, it } from "vitest";
import { projectExportSchema } from "@/lib/import/schema";
import { mapProject, similarity, APPROX_TAG } from "@/lib/import/mapProject";

const TODAY = "2026-09-25";

function build(overrides: Record<string, unknown>) {
  return projectExportSchema.parse({
    client: { name: "Acme TMS", code: "ACME", phase: "live", health: "on_track", owner: "Saaqib" },
    ...overrides,
  });
}

describe("similarity", () => {
  it("lines up stems and ignores filler", () => {
    expect(similarity("Check in mail sent to the new manager", "Checked in with the new manager and lined up a discussion for next week")).toBeGreaterThanOrEqual(0.4);
    expect(similarity("Trip plan rerun", "Invoice mismatch raised by finance")).toBe(0);
  });
});

describe("mapProject", () => {
  it("dates undated activities inside this week when the week summary covers them, else today", () => {
    const m = mapProject(
      build({
        activities: [
          { date: null, type: "email", title: "UAT access shared with Sujith for test orders" },
          { date: null, type: "email", title: "Follow up mail sent to Sujith for the report" },
          { date: null, type: "call", title: "Something with no clue at all" },
          { date: "2026-09-01", type: "update", title: "Weekly update" },
        ],
        this_week: { done: ["Shared UAT access with Sujith for test and dummy orders", "Sent a follow up to Sujith for the pending report"], planned_next_week: [], blockers_or_delays: [] },
      }),
      TODAY,
    );
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(iso(m.activities[0].occurredAt)).toBe("2026-09-23");
    expect(iso(m.activities[1].occurredAt)).toBe("2026-09-24");
    expect(iso(m.activities[2].occurredAt)).toBe(TODAY);
    expect(m.activities[2].tags).toContain(APPROX_TAG);
    expect(m.activities[3].tags).toEqual([]);
    // Export order survives inside a day.
    expect(m.activities[1].occurredAt.getTime()).toBeGreaterThan(m.activities[0].occurredAt.getTime());
  });

  it("takes a dateless finished milestone's date from its note", () => {
    const m = mapProject(
      build({
        milestones: [{ title: "Scope of work signed off", type: "other", status: "done", date: null, reason_for_change: "Signed via Zoho Sign in the week commencing 14 Sep 2026" }],
      }),
      TODAY,
    );
    expect(m.milestones).toHaveLength(0);
    expect(m.activities[0].occurredAt.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(m.activities[0].tags).toContain(APPROX_TAG);
  });

  it("does not add a set a date task when a similar task exists", () => {
    const m = mapProject(
      build({
        milestones: [
          { title: "System demo for Jebel Ali clearance team", type: "other", status: "upcoming", date: null },
          { title: "Board pack sign off", type: "other", status: "upcoming", date: null },
        ],
        tasks: [{ title: "Schedule and run the system demo for the Jebel Ali clearance team", status: "todo", priority: "high" }],
      }),
      TODAY,
    );
    expect(m.tasks.map((t) => t.title)).toEqual(["Schedule and run the system demo for the Jebel Ali clearance team", "Board pack sign off: set a date"]);
  });

  it("drops a past proposal milestone that repeats an activity and keeps real overdue dates", () => {
    const m = mapProject(
      build({
        milestones: [
          { title: "Offline meeting proposed for 17th, 2 to 4 PM", type: "other", status: "upcoming", date: "2026-08-17" },
          { title: "HLD sign off, Phase 1 gate", type: "target", status: "upcoming", date: "2026-09-21" },
        ],
        activities: [{ date: "2026-08-17", type: "email", title: "Offline meeting proposed to Sujith for the 17th" }],
      }),
      TODAY,
    );
    expect(m.milestones.map((x) => x.title)).toEqual(["HLD sign off, Phase 1 gate"]);
  });

  it("turns a task waiting on the owner into a plain to do", () => {
    const m = mapProject(build({ tasks: [{ title: "Confirm the crossdock workflow", status: "todo", waiting_on: "Saaqib" }] }), TODAY);
    expect(m.tasks[0].status).toBe("todo");
    expect(m.tasks[0].waitingOn).toBeNull();
  });
});
