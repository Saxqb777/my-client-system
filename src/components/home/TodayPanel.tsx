import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { Panel } from "@/components/aurora/Panel";
import { TaskRow } from "@/components/tasks/TaskRow";

/** The short version of the tasks page: what is late, what is due today, who you are waiting on. */
export function TodayPanel({ data }: { data: Dashboard }) {
  // One row per task: a waiting task due today is in both dueToday and waiting, so dedupe by id.
  const seen = new Set<string>();
  const rows = [...data.overdueTasks, ...data.dueToday, ...data.waiting].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 8);
  const dueToday = data.dueToday.filter((t) => !data.overdueTasks.some((o) => o.id === t.id)).length;
  const count = data.overdueTasks.length + dueToday;
  return (
    <Panel
      title="Today"
      aside={
        <Link href="/tasks" className="link">
          All tasks
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="py-3 text-[14px] text-muted">
          Nothing due today.{" "}
          <Link href="/tasks" className="link">
            Add a task
          </Link>
        </p>
      ) : (
        <>
          {count > 0 && (
            <p className="mb-1 text-[12px] text-muted">
              {data.overdueTasks.length ? `${data.overdueTasks.length} overdue` : ""}
              {data.overdueTasks.length && dueToday ? ", " : ""}
              {dueToday ? `${dueToday} due today` : ""}
            </p>
          )}
          <ul>
            {rows.map((t) => (
              <TaskRow key={t.id} task={t} client={t.client} compact />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
