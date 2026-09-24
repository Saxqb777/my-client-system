import { getDashboard } from "@/lib/data/dashboard";
import { getOwnerName } from "@/lib/data/settings";
import { GlassCard, CardEyebrow, CardTitle } from "@/components/aurora/GlassCard";
import { HeroSummary } from "@/components/home/HeroSummary";
import { OrbitView } from "@/components/home/OrbitView";
import { FocusPanel } from "@/components/home/FocusPanel";
import { WeekStrip } from "@/components/home/WeekStrip";
import { RecentActivity } from "@/components/home/RecentActivity";
import { AttentionList } from "@/components/home/AttentionList";

export default async function HomePage() {
  const [data, ownerName] = await Promise.all([getDashboard(), getOwnerName()]);
  const counts = { on_track: 0, at_risk: 0, blocked: 0 };
  for (const c of data.clients) counts[c.health]++;
  const attention = data.overdueTasks.length + data.overdueMilestones.length + data.dueToday.length + counts.blocked;

  return (
    <div className="animate-fade-up">
      <HeroSummary ownerName={ownerName} counts={counts} attention={attention} />

      <div className="grid gap-5 lg:grid-cols-12">
        <GlassCard className="lg:col-span-7">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <CardEyebrow>Orbit view</CardEyebrow>
              <CardTitle className="mt-1">Every client, in one glance</CardTitle>
            </div>
            <p className="hidden text-[11px] text-muted sm:block">Size: activity in 14 days · Colour: health · Ring: distance to go live</p>
          </div>
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
        </GlassCard>
        <div className="lg:col-span-5">
          <FocusPanel data={data} />
        </div>
      </div>

      <div className="mt-5">
        <WeekStrip milestones={data.weekMilestones} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <AttentionList clients={data.clients} />
        <RecentActivity items={data.recent} />
      </div>
    </div>
  );
}
