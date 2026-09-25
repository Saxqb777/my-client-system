import { describe, expect, it } from "vitest";
import { parseTaskLine } from "@/lib/ai/taskline";
import type { Client } from "@/lib/db/schema";

const TODAY = "2026-09-25"; // a Friday

function client(code: string, name: string, aliases: string[] = []): Client {
  return {
    id: `id-${code}`,
    code,
    name,
    aliases,
    fullName: null,
    system: null,
    owner: "Saaqib",
    phase: "uat",
    health: "on_track",
    nextStep: null,
    phaseStartDate: null,
    phaseTargetDate: null,
    phaseTargetOriginal: null,
    color: null,
    notes: null,
    momFormat: null,
    sortOrder: 0,
    demoStatus: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const clients = [client("ADSO", "ADSO TMS and Clearance", ["TAME"]), client("IDS", "IDS DASH", ["DASH"])];

describe("parseTaskLine", () => {
  it("reads client, date, waiting on and priority from one line", () => {
    const t = parseTaskLine("ADSO waiting on Mohamad for the AFSYS session next Monday, high", clients, TODAY);
    expect(t.clientCode).toBe("ADSO");
    expect(t.dueDate).toBe("2026-09-28");
    expect(t.waitingOn).toBe("Mohamad");
    expect(t.priority).toBe("high");
    expect(t.title).toBe("Waiting on Mohamad for the AFSYS session");
  });

  it("keeps a plain line plain", () => {
    const t = parseTaskLine("Book the meeting room", clients, TODAY);
    expect(t.clientCode).toBeNull();
    expect(t.dueDate).toBeNull();
    expect(t.waitingOn).toBeNull();
    expect(t.title).toBe("Book the meeting room");
  });

  it("understands tomorrow and urgent", () => {
    const t = parseTaskLine("IDS rerun trip plan tomorrow urgent", clients, TODAY);
    expect(t.clientCode).toBe("IDS");
    expect(t.dueDate).toBe("2026-09-26");
    expect(t.priority).toBe("urgent");
    expect(t.title).toBe("Rerun trip plan");
  });
});
