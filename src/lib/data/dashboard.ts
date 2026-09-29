import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { listClientSummaries } from "./clients";
import { listMeetingsAwaitingMinutes, listUpcomingMeetings } from "./meetings";
import { countProcessing } from "./meetingLibrary";
import { listOverdueMilestones, listUpcomingMilestones } from "./milestones";
import { listOverdueTasks, listTasksDueToday, listWaitingTasks } from "./tasks";

export async function getDashboard() {
  const db = await getDb();
  const [clients, dueToday, overdueTasks, overdueMilestones, upcoming, waiting, recent, meetings, awaitingMinutes, processing] = await Promise.all([
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
    countProcessing(),
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
    /** Ingested meetings waiting on Saaqib: unmatched ones plus failures. */
    meetingsToReview: processing.needs_review + processing.failed,
    meetingsInFlight: processing.received + processing.processing,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
