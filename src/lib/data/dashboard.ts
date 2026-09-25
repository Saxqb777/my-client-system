import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { listClientSummaries } from "./clients";
import { listMeetingsAwaitingMinutes, listUpcomingMeetings } from "./meetings";
import { listOverdueMilestones, listUpcomingMilestones } from "./milestones";
import { listOverdueTasks, listTasksDueToday, listWaitingTasks } from "./tasks";

export async function getDashboard() {
  const db = await getDb();
  const [clients, dueToday, overdueTasks, overdueMilestones, upcoming, waiting, recent, meetings, awaitingMinutes] = await Promise.all([
    listClientSummaries(),
    listTasksDueToday(),
    listOverdueTasks(),
    listOverdueMilestones(),
    listUpcomingMilestones(45),
    listWaitingTasks(),
    db.query.activities.findMany({
      where: isNotNull(activities.clientId),
      with: { client: true },
      orderBy: [desc(activities.occurredAt)],
      limit: 12,
    }),
    listUpcomingMeetings(7),
    listMeetingsAwaitingMinutes(),
  ]);
  return {
    clients,
    dueToday,
    overdueTasks,
    overdueMilestones,
    upcoming,
    waiting,
    recent: recent.filter((a) => a.client && !a.client.archivedAt),
    meetings,
    awaitingMinutes,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
