import type { Metadata } from "next";
import { Suspense } from "react";
import { listClientSummaries } from "@/lib/data/clients";
import { PageHeader } from "@/components/aurora/PageHeader";
import { ClientsGrid } from "@/components/clients/ClientsGrid";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const all = await listClientSummaries({ includeArchived: true });
  const active = all.filter((c) => !c.archivedAt);
  const archived = all.filter((c) => c.archivedAt);
  return (
    <div className="animate-fade-up">
      <PageHeader title="Clients" description={`${active.length} active${archived.length ? `, ${archived.length} archived` : ""}`} />
      <Suspense>
        <ClientsGrid clients={active} archived={archived} />
      </Suspense>
    </div>
  );
}
