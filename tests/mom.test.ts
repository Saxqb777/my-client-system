import { describe, expect, it } from "vitest";
import { normalizeMinutes, rulesMinutes, topicHead, type MinutesContext } from "@/lib/ai/mom";

const ctx = {
  meeting: { title: "OMS BRD Session 3", location: "Microsoft Teams", attendees: [] },
  client: null,
  transcript: "Speaker 1: units of measure carry a code.",
} as unknown as MinutesContext;

describe("discussion point topic heads", () => {
  it("keeps the topic Claude gave and strips a trailing colon", () => {
    const plan = normalizeMinutes({ ...rulesMinutes(ctx), points: [{ topic: "Units of Measure:", text: "Each unit carries a code and a dimension." }] });
    expect(plan.points[0]).toEqual({ topic: "Units of Measure", text: "Each unit carries a code and a dimension." });
  });

  it("gives a point without a topic a head from its opening words", () => {
    const plan = normalizeMinutes({
      ...rulesMinutes(ctx),
      points: [
        { topic: "", text: "Vendor allocation routes a request to the cheapest vendor by default, passing to the next on rejection." },
        { topic: "  ", text: "The service provider user type is to be added." },
      ],
    });
    expect(plan.points[0].topic).toBe("Vendor allocation routes a request");
    expect(plan.points[1].topic).toBe("service provider user type");
    expect(plan.points.every((p) => p.topic.length > 0)).toBe(true);
  });

  it("does not pad or trim the number of points", () => {
    const points = Array.from({ length: 23 }, (_, i) => ({ topic: `Topic ${i + 1}`, text: `Point ${i + 1}.` }));
    expect(normalizeMinutes({ ...rulesMinutes(ctx), points }).points).toHaveLength(23);
    expect(normalizeMinutes({ ...rulesMinutes(ctx), points: points.slice(0, 2) }).points).toHaveLength(2);
  });

  it("topicHead stops at the first comma, colon or full stop, at five words, and drops weak trailing words", () => {
    expect(topicHead("Session Planning. Longer sessions were proposed.")).toBe("Session Planning");
    expect(topicHead("Granular permissions are to be set at action level, so that fines are limited.")).toBe("Granular permissions");
    expect(topicHead("Tenants are charged by ADFH at the published rate.")).toBe("Tenants are charged by ADFH");
  });
});
