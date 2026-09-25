import type { Metadata } from "next";
import { listClients } from "@/lib/data/clients";
import { listDoneSince, listOpenTasks } from "@/lib/data/tasks";
import { todayISO } from "@/lib/core/dates";
import { PageHeader } from "@/components/aurora/PageHeader";
import { TaskQuickAdd } from "@/components/tasks/TaskQuickAdd";
import { TaskList } from "@/components/tasks/TaskList";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const today = todayISO();
  const startOfDay = new Date(`${today}T00:00:00+04:00`);
  const [open, doneToday, clients] = await Promise.all([listOpenTasks(), listDoneSince(startOfDay), listClients()]);
  const dueToday = open.filter((t) => t.dueDate === today && t.status !== "waiting").length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today && t.status !== "waiting").length;
  const parts = [`${open.length} open`];
  if (dueToday) parts.push(`${dueToday} due today`);
  if (overdue) parts.push(`${overdue} overdue`);
  if (doneToday.length) parts.push(`${doneToday.length} done today`);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Tasks" description={parts.join(", ")} />
      <TaskQuickAdd className="-mt-2" autoFocus />
      <div className="mt-10">
        <TaskList open={open} doneToday={doneToday} clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} />
      </div>
    </div>
  );
}
