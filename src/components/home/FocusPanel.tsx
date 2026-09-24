import Link from "next/link";
import { AlertTriangle, CalendarClock, Hourglass, Sun } from "lucide-react";
import type { Dashboard } from "@/lib/data/dashboard";
import { countdownLabel, daysUntil } from "@/lib/core/dates";
import { GlassCard, CardEyebrow, CardTitle } from "@/components/aurora/GlassCard";
import { TaskRow } from "@/components/tasks/TaskRow";
import { cn } from "@/lib/utils";

export function FocusPanel({ data }: { data: Dashboard }) {
  const overdueCount = data.overdueTasks.length + data.overdueMilestones.length;
  const oldestWaiting = data.waiting
    .map((t) => ({ t, days: t.waitingSince ? -daysUntil(t.waitingSince) : 0 }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  return (
    <GlassCard className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <div>
          <CardEyebrow>Today&apos;s focus</CardEyebrow>
          <CardTitle className="mt-1">What needs you</CardTitle>
        </div>
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-warn">
          <Sun className="size-4" />
        </span>
      </div>

      <div className="mt-4 space-y-5">
        <Block icon={<AlertTriangle className="size-3.5" />} title="Overdue" count={overdueCount} tone="bad">
          {data.overdueMilestones.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="orb orb-bad !size-2.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">
                  {m.title} <span className="text-muted">for</span>{" "}
                  <Link href={`/clients/${m.client.id}`} className="num text-teal hover:underline">
                    {m.client.code}
                  </Link>
                </p>
                <p className="text-[11px] text-bad">{countdownLabel(m.date)}</p>
              </div>
            </li>
          ))}
          {data.overdueTasks.map((t) => (
            <TaskRow key={t.id} task={t} client={t.client} compact />
          ))}
          {overdueCount === 0 && <Empty>Nothing overdue. Good.</Empty>}
        </Block>

        <Block icon={<CalendarClock className="size-3.5" />} title="Due today" count={data.dueToday.length} tone="warn">
          {data.dueToday.map((t) => (
            <TaskRow key={t.id} task={t} client={t.client} compact />
          ))}
          {data.dueToday.length === 0 && <Empty>No tasks due today.</Empty>}
        </Block>

        <Block icon={<Hourglass className="size-3.5" />} title="Waiting on others" count={data.waiting.length} tone="neutral">
          {oldestWaiting.map(({ t }) => (
            <TaskRow key={t.id} task={t} client={t.client} compact />
          ))}
          {data.waiting.length === 0 && <Empty>You are not waiting on anyone.</Empty>}
        </Block>
      </div>
    </GlassCard>
  );
}

function Block({ icon, title, count, tone, children }: { icon: React.ReactNode; title: string; count: number; tone: "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <span className={cn("flex items-center gap-1.5 text-[12px] font-medium", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-text-2")}>
          {icon} {title}
        </span>
        <span className="num text-[11px] text-muted">{count}</span>
      </div>
      <ul className="divide-y divide-border/60">{children}</ul>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="py-2 text-[13px] text-muted">{children}</li>;
}
