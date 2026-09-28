import type { Metadata } from "next";
import { listClients } from "@/lib/data/clients";
import { listOverdueMilestones, listTrackerMilestones, listUpcomingMilestones } from "@/lib/data/milestones";
import { todayISO } from "@/lib/core/dates";
import { PageHeader } from "@/components/aurora/PageHeader";
import { Panel } from "@/components/aurora/Panel";
import { DatesList } from "@/components/dates/DatesList";
import { Tracker } from "@/components/dates/Tracker";

export const metadata: Metadata = { title: "Dates" };

export default async function DatesPage() {
  const [overdue, upcoming, clients, all] = await Promise.all([listOverdueMilestones(), listUpcomingMilestones(400), listClients(), listTrackerMilestones()]);
  const rows = [...overdue, ...upcoming];
  const today = todayISO();
  const tracker = clients.map((c) => ({
    client: { id: c.id, code: c.code, name: c.name, phase: c.phase, health: c.health },
    milestones: all.filter((m) => m.clientId === c.id),
  }));
  return (
    <div className="animate-fade-up space-y-10">
      <div>
        <PageHeader title="Dates" description={`${rows.length} open${overdue.length ? `, ${overdue.length} overdue` : ""}`} className="mb-4" />
        <Panel title="Tracker" aside="Hover to read, click to act, drag to move, click the line to add">
          <Tracker rows={tracker} today={today} />
        </Panel>
      </div>
      <DatesList rows={rows} clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} />
    </div>
  );
}
