"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import type { TaskWithClient } from "@/lib/data/tasks";
import { reorderTasksAction } from "@/actions/tasks";
import { addDaysISO, todayISO } from "@/lib/core/dates";
import type { NavClient } from "@/components/shell/nav";
import { Panel } from "@/components/aurora/Panel";
import { TaskRow } from "./TaskRow";

type Group = { key: string; title: string; items: TaskWithClient[]; hint?: string };

export function groupTasks(open: TaskWithClient[], today = todayISO()) {
  const weekEnd = addDaysISO(today, 7);
  const overdue: TaskWithClient[] = [];
  const dueToday: TaskWithClient[] = [];
  const week: TaskWithClient[] = [];
  const later: TaskWithClient[] = [];
  const noDate: TaskWithClient[] = [];
  const waiting: TaskWithClient[] = [];
  for (const t of open) {
    if (t.status === "waiting") waiting.push(t);
    else if (!t.dueDate) noDate.push(t);
    else if (t.dueDate < today) overdue.push(t);
    else if (t.dueDate === today) dueToday.push(t);
    else if (t.dueDate <= weekEnd) week.push(t);
    else later.push(t);
  }
  return { overdue, dueToday, week, later, noDate, waiting };
}

export function TaskList({ open, doneToday, clients }: { open: TaskWithClient[]; doneToday: TaskWithClient[]; clients: NavClient[] }) {
  const g = groupTasks(open);
  const groups: Group[] = [
    { key: "overdue", title: "Overdue", items: g.overdue, hint: "Carried over. Tick, move or clear the date." },
    { key: "week", title: "This week", items: g.week },
    { key: "later", title: "Later", items: g.later },
    { key: "nodate", title: "No date", items: g.noDate },
    { key: "waiting", title: "Waiting on others", items: g.waiting },
  ];

  return (
    <div className="space-y-10">
      <TodayGroup items={g.dueToday} clients={clients} />
      {groups.map((grp) =>
        grp.items.length === 0 ? null : (
          <Panel key={grp.key} title={grp.title} aside={String(grp.items.length)}>
            <ul>
              {grp.items.map((t) => (
                <TaskRow key={t.id} task={t} client={t.client} clients={clients} />
              ))}
            </ul>
          </Panel>
        ),
      )}
      {doneToday.length > 0 && (
        <Panel title="Done today" aside={String(doneToday.length)}>
          <ul className="opacity-80">
            {doneToday.map((t) => (
              <TaskRow key={t.id} task={t} client={t.client} clients={clients} compact />
            ))}
          </ul>
        </Panel>
      )}
      {open.length === 0 && doneToday.length === 0 && <p className="py-4 text-[14px] text-muted">Nothing open. Add a line above.</p>}
    </div>
  );
}

/** Today's list can be dragged into the order you want to work it. */
function TodayGroup({ items, clients }: { items: TaskWithClient[]; clients: NavClient[] }) {
  const [order, setOrder] = useState(items);
  // Adopt fresh server data when the set of tasks changes.
  const key = items.map((t) => t.id).join("|");
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setOrder(items);
  }

  // Runs after the last onReorder render, so `order` is current.
  function persist() {
    void reorderTasksAction(order.map((t) => t.id));
  }

  return (
    <Panel title="Today" aside={items.length ? `${items.length} due` : undefined}>
      {items.length === 0 ? (
        <p className="py-3 text-[14px] text-muted">Nothing due today.</p>
      ) : (
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={setOrder}
          as="ul"
        >
          {order.map((t) => (
            <Reorder.Item key={t.id} value={t} as="div" onDragEnd={persist}>
              <ul>
                <TaskRow task={t} client={t.client} clients={clients} handle />
              </ul>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
    </Panel>
  );
}
