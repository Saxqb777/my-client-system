import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { Panel } from "@/components/aurora/Panel";
import { TaskRow } from "@/components/tasks/TaskRow";

/** The short version of the tasks page: what is late, what is due today, who you are waiting on. */
export function TodayPanel({ data }: { data: Dashboard }) {
  const rows = [...data.overdueTasks, ...data.dueToday, ...data.waiting.filter((t) => !data.overdueTasks.some((o) => o.id === t.id))].slice(0, 8);
  const count = data.overdueTasks.length + data.dueToday.length;
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
              {data.overdueTasks.length && data.dueToday.length ? ", " : ""}
              {data.dueToday.length ? `${data.dueToday.length} due today` : ""}
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
