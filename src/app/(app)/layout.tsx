import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guard";
import { listClients } from "@/lib/data/clients";
import { getOwnerName } from "@/lib/data/settings";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const [clients, ownerName] = await Promise.all([listClients(), getOwnerName()]);
  return (
    <AppShell clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} ownerName={ownerName}>
      {children}
    </AppShell>
  );
}
