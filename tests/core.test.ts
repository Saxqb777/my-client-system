import { describe, expect, it } from "vitest";
import { delayText, meetingWeek, reportingWeek } from "@/lib/core/dates";
import { cleanStyle } from "@/lib/core/style";
import { extractDates, matchClient } from "@/lib/core/text";
import type { Client } from "@/lib/db/schema";

const base: Omit<Client, "id" | "name" | "code" | "aliases" | "fullName"> = {
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
  sortOrder: 0,
  demoStatus: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const clients: Client[] = [
  { ...base, id: "1", name: "ADFH OMS", code: "ADFH", fullName: "Abu Dhabi Food Hub", aliases: ["Food Hub"] },
  { ...base, id: "2", name: "IDS DASH", code: "IDS", fullName: "Al Etihad Drug Store", aliases: ["Etihad Drug"] },
  { ...base, id: "3", name: "Al Foah Gate System", code: "ALFOAH", fullName: null, aliases: ["Al Foah", "Foah"] },
];

describe("style", () => {
  it("removes dashes used as punctuation and hyphenated words", () => {
    expect(cleanStyle("UAT sign-off done — go-live moved")).toBe("UAT sign off done: go live moved");
    expect(cleanStyle("BRD start delayed - 1 week")).toBe("BRD start delayed: 1 week");
    expect(cleanStyle("Target 2026-10-15 stays")).toBe("Target 2026-10-15 stays");
  });
});

describe("delayText", () => {
  it("writes delays the Friday table way", () => {
    expect(delayText("2026-09-14", "2026-09-21")).toBe("1 week");
    expect(delayText("2026-09-14", "2026-09-17")).toBe("3 days");
    expect(delayText("2026-09-14", "2026-10-05")).toBe("3 weeks");
    expect(delayText("2026-09-14", "2026-09-10")).toBe("");
  });
});

describe("weeks", () => {
  it("runs Friday to Thursday in Dubai time", () => {
    // 2026-09-24 is a Thursday
    const thu = new Date("2026-09-24T18:00:00+04:00");
    expect(reportingWeek(thu)).toEqual({ start: "2026-09-18", end: "2026-09-24" });
    const fri = new Date("2026-09-25T09:00:00+04:00");
    expect(reportingWeek(fri)).toEqual({ start: "2026-09-25", end: "2026-10-01" });
    expect(meetingWeek(fri)).toEqual({ start: "2026-09-18", end: "2026-09-24" });
  });
});

describe("matchClient", () => {
  it("matches by code, alias and name", () => {
    expect(matchClient("ADFH UAT signed off", clients)?.client.code).toBe("ADFH");
    expect(matchClient("Food hub go live moved", clients)?.client.code).toBe("ADFH");
    expect(matchClient("Call with Al Foah about the gate", clients)?.client.code).toBe("ALFOAH");
    expect(matchClient("random note", clients)).toBeNull();
  });
});

describe("extractDates", () => {
  it("reads common date phrases", () => {
    const today = "2026-09-24";
    expect(extractDates("go live moved to 15 Oct", today).map((d) => d.iso)).toEqual(["2026-10-15"]);
    expect(extractDates("SIT on Oct 3 and UAT 12/10", today).map((d) => d.iso)).toEqual(["2026-10-03", "2026-10-12"]);
    expect(extractDates("follow up tomorrow", today).map((d) => d.iso)).toEqual(["2026-09-25"]);
    expect(extractDates("due next monday", today).map((d) => d.iso)).toEqual(["2026-09-28"]);
    expect(extractDates("target 2027-01-05", today).map((d) => d.iso)).toEqual(["2027-01-05"]);
  });
});
