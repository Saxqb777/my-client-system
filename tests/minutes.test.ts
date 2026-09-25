import { describe, expect, it } from "vitest";
import { legacyMinutes, momFileName, projectLabel, renderMinutesText, type MinutesDoc } from "@/lib/core/minutes";
import { buildMomDocx } from "@/lib/docs/momDocx";

const doc: MinutesDoc = {
  clientCode: "ADFH",
  clientName: "ADFH OMS",
  project: "OMS Project",
  title: "OMS x Maqta Pay Joint Working Session",
  heldAt: new Date("2026-09-24T06:33:00+04:00"),
  location: "Microsoft Teams",
  objective: "Joint working session with the Maqta Pay and Oracle Fusion teams to define how payment collection, invoicing and revenue recording will work.",
  points: [
    { topic: "Payment Scope", text: "Debit and credit card payments only for the first phase, with other methods such as Apple Pay deferred." },
    { topic: "Settlement Model", text: "The Magnati model through the FAB system is preferred over CyberSource." },
  ],
  actions: [
    { text: "Confirm the OMS capability to generate tax invoices", owner: "Fero" },
    { text: "Create the dedicated IBAN for Food Hub collections", owner: "Francisco Ortega" },
  ],
};

describe("renderMinutesText", () => {
  it("renders the standard layout", () => {
    const text = renderMinutesText(doc);
    const lines = text.split("\n");
    expect(lines[0]).toBe("ADFH × Fero | OMS x Maqta Pay Joint Working Session");
    expect(lines[1]).toBe("24 September 2026  |  Microsoft Teams");
    expect(text).toContain("\nMeeting Objective\nJoint working session");
    expect(text).toContain("\nDiscussion Points\n• Payment Scope: Debit and credit");
    expect(text).toContain("\nAction Points\n1. Confirm the OMS capability to generate tax invoices (Fero)\n2. Create the dedicated IBAN for Food Hub collections (Francisco Ortega)");
    expect(text).not.toMatch(/[—–]/);
  });

  it("drops the location when unknown", () => {
    expect(renderMinutesText({ ...doc, location: null }).split("\n")[1]).toBe("24 September 2026");
  });
});

describe("projectLabel", () => {
  it("reads the acronym from the system name", () => {
    expect(projectLabel({ name: "ADFH OMS", system: "Operations Management System (OMS)" })).toBe("OMS Project");
    expect(projectLabel({ name: "IDS DASH", system: "DASH (Fero dispatch and delivery management), integrated with Oracle" })).toBe("DASH Project");
    expect(projectLabel({ name: "ADSO TMS", system: "TAME by Fero (TMS), plus Fero FMS proposed" })).toBe("TAME Project");
    expect(projectLabel({ name: "Agthia FMS", system: "Freight Management System (FMS), also called Freight Management Controlling Tower" })).toBe("FMS Project");
    expect(projectLabel({ name: "RSA Talke", system: null })).toBe("RSA Talke");
  });
});

describe("momFileName", () => {
  it("follows the ADFH_Fero_Title_MOM pattern", () => {
    expect(momFileName(doc)).toBe("ADFH_Fero_OMSXMaqtaPayJointWorkingSession_MOM.docx");
    expect(momFileName({ clientCode: "IDS", title: "UAT Session 2 (on site)" })).toBe("IDS_Fero_UATSession2OnSite_MOM.docx");
  });
});

describe("legacyMinutes", () => {
  it("lifts objective and points out of imported minutes", () => {
    const mom = [
      "Joint working session with the Maqta Pay and Oracle Fusion teams. Ran in two parts.",
      "",
      "Decisions",
      "• Debit and credit card payments only for the first phase with other methods deferred",
      "• Leasing invoices remain in CRM",
      "",
      "Actions",
      "1. Confirm the OMS capability to generate tax invoices (Fero)",
      "2. Create the dedicated IBAN for Food Hub collections (Francisco Ortega)",
    ].join("\n");
    const body = legacyMinutes(mom);
    expect(body.objective).toBe("Joint working session with the Maqta Pay and Oracle Fusion teams. Ran in two parts.");
    expect(body.points).toEqual([
      { topic: "", text: "Debit and credit card payments only for the first phase with other methods deferred" },
      { topic: "", text: "Leasing invoices remain in CRM" },
    ]);
  });

  it("keeps a topic label when the line has one", () => {
    const body = legacyMinutes("Purpose line.\n\nDiscussion\n• Payment Scope: cards only\n• plain point");
    expect(body.points[0]).toEqual({ topic: "Payment Scope", text: "cards only" });
    expect(body.points[1]).toEqual({ topic: "", text: "plain point" });
  });
});

describe("buildMomDocx", () => {
  it("produces a Word file", async () => {
    const file = await buildMomDocx(doc);
    expect(file.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(file.length).toBeGreaterThan(2500);
  });
});
