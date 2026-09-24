import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { listClientSummaries } from "./clients";
import { listOverdueMilestones, listUpcomingMilestones } from "./milestones";
import { listOverdueTasks, listTasksDueToday, listWaitingTasks } from "./tasks";

export async function getDashboard() {
  const db = await getDb();
  const [clients, dueToday, overdueTasks, overdueMilestones, weekMilestones, waiting, recent] = await Promise.all([
    listClientSummaries(),
    listTasksDueToday(),
    listOverdueTasks(),
    listOverdueMilestones(),
    listUpcomingMilestones(7),
    listWaitingTasks(),
    db.query.activities.findMany({
      where: isNotNull(activities.clientId),
      with: { client: true },
      orderBy: [desc(activities.occurredAt)],
      limit: 12,
    }),
  ]);
  return {
    clients,
    dueToday,
    overdueTasks,
    overdueMilestones,
    weekMilestones,
    waiting,
    recent: recent.filter((a) => a.client && !a.client.archivedAt),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
