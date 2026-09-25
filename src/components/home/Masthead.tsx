import { formatInTimeZone } from "date-fns-tz";
import type { ClientSummary } from "@/lib/data/clients";
import type { MilestoneWithClient } from "@/lib/data/milestones";
import { TIMEZONE } from "@/lib/core/constants";
import { countdownLabel, daysUntil } from "@/lib/core/dates";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One factual headline built from the data, and one line of counts underneath. */
export function Masthead({ clients, upcoming, overdue }: { clients: ClientSummary[]; upcoming: MilestoneWithClient[]; overdue: MilestoneWithClient[] }) {
  const now = new Date();
  const dateLine = formatInTimeZone(now, TIMEZONE, "EEEE d MMMM yyyy");

  let headline: string;
  if (clients.length === 0) headline = "No clients yet.";
  else if (overdue.length === 1) {
    const m = overdue[0];
    headline = `${m.client.name}: ${m.title} is ${plural(Math.abs(daysUntil(m.date)), "day", "days")} late.`;
  } else if (overdue.length > 1) headline = `${overdue.length} dates are overdue.`;
  else if (upcoming.length > 0) {
    const m = upcoming[0];
    headline = `${m.client.name}: ${m.title} ${countdownLabel(m.date)}.`;
  } else headline = "No dates in the next six weeks.";

  const atRisk = clients.filter((c) => c.health === "at_risk").length;
  const blocked = clients.filter((c) => c.health === "blocked").length;
  const facts: string[] = [];
  if (clients.length) facts.push(plural(clients.length, "client", "clients"));
  if (blocked) facts.push(`${blocked} blocked`);
  if (atRisk) facts.push(`${atRisk} at risk`);
  if (!blocked && !atRisk && clients.length) facts.push("all on track");
  if (upcoming.length) facts.push(`${plural(upcoming.length, "date", "dates")} in the next 45 days`);

  return (
    <header className="border-b border-ink pb-7">
      <p className="num text-[12px] text-muted">{dateLine}, Abu Dhabi</p>
      <h1 className="serif mt-3 max-w-4xl text-[36px] leading-[1.06] text-text sm:text-[52px]">{headline}</h1>
      {facts.length > 0 && <p className="mt-4 text-[15px] text-text-2">{facts.join(". ")}.</p>}
    </header>
  );
}
