import { getDashboard } from "@/lib/data/dashboard";
import { Panel } from "@/components/aurora/Panel";
import { Masthead } from "@/components/home/Masthead";
import { OrbitView } from "@/components/home/OrbitView";
import { ComingUp } from "@/components/home/ComingUp";
import { RecentActivity } from "@/components/home/RecentActivity";
import { ClientsTable } from "@/components/clients/ClientsTable";
import { QuickLogBar } from "@/components/quicklog/QuickLogBar";
import { TodayPanel } from "@/components/home/TodayPanel";
import { MeetingsPanel } from "@/components/home/MeetingsPanel";

export default async function HomePage() {
  const data = await getDashboard();

  return (
    <div className="animate-fade-up">
      <Masthead clients={data.clients} upcoming={data.upcoming} overdue={data.overdueMilestones} />
      <QuickLogBar className="mt-1" />

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <Panel className="lg:col-span-7" title="Orbit" aside={`${data.clients.length} ${data.clients.length === 1 ? "client" : "clients"}`}>
          <OrbitView
            clients={data.clients.map((c) => ({
              id: c.id,
              name: c.name,
              code: c.code,
              health: c.health,
              phase: c.phase,
              activityCount14d: c.activityCount14d,
              nextStep: c.nextStep,
              nextMilestone: c.nextMilestone ? { title: c.nextMilestone.title, date: c.nextMilestone.date } : null,
            }))}
          />
        </Panel>
        <div className="space-y-10 lg:col-span-5">
          <TodayPanel data={data} />
          <MeetingsPanel data={data} />
          <ComingUp upcoming={data.upcoming} overdue={data.overdueMilestones} />
        </div>
      </div>

      <div className="mt-12">
        <ClientsTable clients={data.clients} title="Clients" />
      </div>

      <div className="mt-12">
        <RecentActivity items={data.recent} />
      </div>
    </div>
  );
}
