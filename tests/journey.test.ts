import { describe, expect, it } from "vitest";
import { dateAt, daysBetween, fractionFor, journeyDomain, layoutJourney, monthTicks } from "@/lib/core/journey";

describe("journeyDomain", () => {
  it("pads around the dates and today", () => {
    const d = journeyDomain(["2026-10-01", "2026-10-21"], "2026-09-28", { padBefore: 7, padAfter: 14, minDays: 10 });
    expect(d.start).toBe("2026-09-21");
    expect(d.end).toBe("2026-11-04");
    expect(d.days).toBe(44);
  });
  it("never goes below the minimum span", () => {
    const d = journeyDomain([], "2026-09-28", { padBefore: 7, padAfter: 14, minDays: 60 });
    expect(d.days).toBe(60);
    expect(fractionFor("2026-09-28", d)).toBeGreaterThan(0.2);
    expect(fractionFor("2026-09-28", d)).toBeLessThan(0.6);
  });
});

describe("fractionFor and dateAt", () => {
  const d = { start: "2026-09-21", end: "2026-10-21", days: 30 };
  it("round trip", () => {
    expect(fractionFor("2026-09-21", d)).toBe(0);
    expect(fractionFor("2026-10-21", d)).toBe(1);
    expect(fractionFor("2026-10-06", d)).toBe(0.5);
    expect(dateAt(0.5, d)).toBe("2026-10-06");
    expect(dateAt(-1, d)).toBe("2026-09-21");
    expect(dateAt(2, d)).toBe("2026-10-21");
    expect(daysBetween("2026-09-28", "2026-10-09")).toBe(11);
  });
});

describe("layoutJourney", () => {
  const d = { start: "2026-09-21", end: "2026-10-31", days: 40 };
  function overlaps(placed: ReturnType<typeof layoutJourney<{ date: string; title: string }>>) {
    const spans = placed
      .filter((p) => !p.hidden)
      .map((p) => {
        const w = p.compact ? 44 : Math.max(44, Math.min(120, p.item.title.length * 6.4 + 4));
        const iv = p.anchor === "center" ? [p.px - w / 2, p.px + w / 2] : p.anchor === "start" ? [p.px + 10, p.px + 10 + w] : [p.px - 10 - w, p.px - 10];
        return { lane: p.lane, iv };
      });
    for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) if (spans[i].lane === spans[j].lane && spans[i].iv[0] < spans[j].iv[1] && spans[j].iv[0] < spans[i].iv[1]) return true;
    return false;
  }
  it("spreads same day marks apart and keeps every visible label clear of the others", () => {
    const items = [
      { id: "a", date: "2026-10-12", title: "Solution design sign off" },
      { id: "b", date: "2026-10-12", title: "Phase 2 gate, SIT complete" },
      { id: "c", date: "2026-10-15", title: "UAT sign off" },
      { id: "d", date: "2026-10-21", title: "Go live" },
    ];
    const placed = layoutJourney(items, d, 800);
    // Same day ties break on the title, so "Phase 2 gate" sits before "Solution design".
    expect(placed.map((p) => p.item.id)).toEqual(["b", "a", "c", "d"]);
    expect(placed[1].px - placed[0].px).toBeGreaterThanOrEqual(16);
    expect(placed.filter((p) => !p.hidden).length).toBe(4);
    expect(overlaps(placed)).toBe(false);
  });
  it("keeps every label centred above when there is room", () => {
    const placed = layoutJourney(
      [
        { date: "2026-09-25", title: "BRD" },
        { date: "2026-10-20", title: "Go live" },
      ],
      d,
      800,
    );
    expect(placed.every((p) => p.lane === 0 && p.anchor === "center" && !p.compact && !p.hidden)).toBe(true);
  });
  it("shrinks to the date and then hides when a cluster is too dense", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ date: "2026-10-01", title: `Integration workshop ${i + 1}` }));
    const placed = layoutJourney(items, d, 600);
    expect(placed.filter((p) => p.compact || p.hidden).length).toBeGreaterThan(0);
    expect(overlaps(placed)).toBe(false);
  });
});

describe("monthTicks", () => {
  it("lists the first of each month inside the axis", () => {
    const ticks = monthTicks({ start: "2026-09-21", end: "2026-12-05", days: 75 });
    expect(ticks.map((t) => t.label)).toEqual(["Oct", "Nov", "Dec"]);
    expect(ticks[0].date).toBe("2026-10-01");
  });
  it("adds the year in January", () => {
    const ticks = monthTicks({ start: "2026-12-10", end: "2027-01-20", days: 41 });
    expect(ticks.map((t) => t.label)).toEqual(["Jan 2027"]);
  });
});

describe("reserved space on the rail", () => {
  it("keeps labels off the Today label", () => {
    const domain = journeyDomain(["2026-09-01", "2026-10-31"], "2026-09-30");
    const width = 800;
    const todayPx = fractionFor("2026-09-30", domain) * width;
    const placed = layoutJourney([{ date: "2026-09-29", title: "Integration workshop two" }], domain, width, { reserved: [{ lane: 0, iv: [todayPx, todayPx + 38] }] });
    const p = placed[0];
    const w = Math.max(44, Math.min(120, "Integration workshop two".length * 6.4 + 4));
    const iv = p.anchor === "center" ? [p.px - w / 2, p.px + w / 2] : p.anchor === "start" ? [p.px + 10, p.px + 10 + w] : [p.px - 10 - w, p.px - 10];
    const overlaps = p.lane === 0 && iv[0] < todayPx + 38 && iv[1] > todayPx;
    expect(p.hidden).toBe(false);
    expect(overlaps).toBe(false);
  });
});
