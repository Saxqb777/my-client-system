import type { Metadata } from "next";
import { listClients } from "@/lib/data/clients";
import { listOverdueMilestones, listUpcomingMilestones } from "@/lib/data/milestones";
import { PageHeader } from "@/components/aurora/PageHeader";
import { DatesList } from "@/components/dates/DatesList";

export const metadata: Metadata = { title: "Dates" };

export default async function DatesPage() {
  const [overdue, upcoming, clients] = await Promise.all([listOverdueMilestones(), listUpcomingMilestones(400), listClients()]);
  const rows = [...overdue, ...upcoming];
  return (
    <div className="animate-fade-up">
      <PageHeader title="Dates" description={`${rows.length} open${overdue.length ? `, ${overdue.length} overdue` : ""}`} />
      <DatesList rows={rows} clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} />
    </div>
  );
}
