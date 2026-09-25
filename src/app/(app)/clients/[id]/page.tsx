import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getClient } from "@/lib/data/clients";
import { EmptyState } from "@/components/aurora/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { ClientTimeline } from "@/components/clients/ClientTimeline";
import { MilestonesPanel } from "@/components/clients/MilestonesPanel";
import { TasksPanel } from "@/components/clients/TasksPanel";
import { PeoplePanel } from "@/components/clients/PeoplePanel";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const client = isUuid(id) ? await getClient(id) : null;
  return { title: client?.name ?? "Client" };
}

function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

export default async function ClientPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const client = await getClient(id);
  if (!client) notFound();
  const openTasks = client.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const upcoming = client.milestones.filter((m) => m.status === "upcoming").length;
  const tab = typeof sp.tab === "string" ? sp.tab : "timeline";

  return (
    <div className="animate-fade-up space-y-7">
      <Link href="/clients" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="size-3.5" /> Clients
      </Link>
      <ClientHeader client={client} />

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="timeline">
            Timeline <Count n={client.activities.length} />
          </TabsTrigger>
          <TabsTrigger value="dates">
            Dates <Count n={upcoming} />
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks <Count n={openTasks} />
          </TabsTrigger>
          <TabsTrigger value="people">
            People <Count n={client.people.length} />
          </TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <ClientTimeline clientId={client.id} clientCode={client.code} activities={client.activities} />
        </TabsContent>
        <TabsContent value="dates">
          <MilestonesPanel clientId={client.id} milestones={client.milestones} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksPanel clientId={client.id} tasks={client.tasks} />
        </TabsContent>
        <TabsContent value="people">
          <PeoplePanel clientId={client.id} people={client.people} />
        </TabsContent>
        <TabsContent value="docs">
          <EmptyState title="Documents arrive in Phase 4" hint="BRDs, MOMs, test cases and guides will live here with full text search." compact />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="num text-[12px] text-muted">{n}</span>;
}
