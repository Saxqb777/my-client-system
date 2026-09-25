import type { Metadata } from "next";
import { aiEnabled, AI_MODEL } from "@/lib/ai/client";
import { getOwnerName } from "@/lib/data/settings";
import { isLocalDb } from "@/lib/db";
import { PageHeader } from "@/components/aurora/PageHeader";
import { Panel } from "@/components/aurora/Panel";
import { Badge } from "@/components/ui/badge";
import { OwnerNameForm } from "@/components/settings/OwnerNameForm";
import { ThemeChoice } from "@/components/settings/ThemeChoice";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ownerName = await getOwnerName();
  const ai = aiEnabled();
  return (
    <div className="animate-fade-up space-y-10">
      <PageHeader title="Settings" />

      <Panel title="Profile">
        <OwnerNameForm initial={ownerName} />
      </Panel>

      <Panel title="Theme">
        <ThemeChoice />
      </Panel>

      <Panel title="Connections">
        <ul className="text-[14px]">
          <Row label="Claude" status={ai ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Not set</Badge>}>
            {ai ? `Quick Log parsing uses ${AI_MODEL}.` : "Add ANTHROPIC_API_KEY in Vercel to turn on Claude parsing. Until then Orbit uses rules."}
          </Row>
          <Row label="Database" status={<Badge tone="ok">{isLocalDb() ? "Local" : "Neon"}</Badge>}>
            {isLocalDb() ? "Embedded local database." : "Neon Postgres, Singapore."}
          </Row>
          <Row label="REST API" status={<Badge>Phase 3</Badge>}>
            Token access and Claude Code commands come in Phase 3.
          </Row>
        </ul>
      </Panel>
    </div>
  );
}

function Row({ label, status, children }: { label: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-28 shrink-0 text-text">{label}</span>
      <span className="flex-1 text-muted">{children}</span>
      {status}
    </li>
  );
}
