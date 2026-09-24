import type { Metadata } from "next";
import { aiEnabled, AI_MODEL } from "@/lib/ai/client";
import { getOwnerName } from "@/lib/data/settings";
import { isDemoLoaded } from "@/lib/demo/seed";
import { isLocalDb } from "@/lib/db";
import { PageHeader } from "@/components/aurora/PageHeader";
import { GlassCard, CardEyebrow, CardTitle } from "@/components/aurora/GlassCard";
import { Badge } from "@/components/ui/badge";
import { OwnerNameForm } from "@/components/settings/OwnerNameForm";
import { ThemeChoice } from "@/components/settings/ThemeChoice";
import { DemoDataCard } from "@/components/settings/DemoDataCard";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [ownerName, demoLoaded] = await Promise.all([getOwnerName(), isDemoLoaded()]);
  const ai = aiEnabled();
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader eyebrow="Preferences" title="Settings" description="Your name, the look of Orbit, demo data and what is connected." />

      <GlassCard>
        <CardEyebrow>Profile</CardEyebrow>
        <CardTitle className="mb-4 mt-1">You</CardTitle>
        <OwnerNameForm initial={ownerName} />
      </GlassCard>

      <GlassCard>
        <CardEyebrow>Appearance</CardEyebrow>
        <CardTitle className="mb-4 mt-1">Theme</CardTitle>
        <ThemeChoice />
      </GlassCard>

      <GlassCard>
        <CardEyebrow>Data</CardEyebrow>
        <CardTitle className="mb-4 mt-1">Demo data</CardTitle>
        <DemoDataCard loaded={demoLoaded} />
      </GlassCard>

      <GlassCard>
        <CardEyebrow>Connections</CardEyebrow>
        <CardTitle className="mb-4 mt-1">What Orbit can use</CardTitle>
        <ul className="divide-y divide-border/60 text-sm">
          <Row label="Claude" status={ai ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Not set</Badge>}>
            {ai ? `Quick Log is understood by ${AI_MODEL}.` : "Add ANTHROPIC_API_KEY in Vercel to turn on smart parsing. Until then Orbit uses rule based reading."}
          </Row>
          <Row label="Database" status={<Badge tone="ok">{isLocalDb() ? "Local" : "Neon"}</Badge>}>
            {isLocalDb() ? "Running on an embedded local database." : "Neon Postgres, Singapore region."}
          </Row>
          <Row label="REST API" status={<Badge>Phase 3</Badge>}>
            Bearer token access and Claude Code commands arrive in Phase 3.
          </Row>
        </ul>
      </GlassCard>
    </div>
  );
}

function Row({ label, status, children }: { label: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-28 shrink-0 font-medium">{label}</span>
      <span className="flex-1 text-muted">{children}</span>
      {status}
    </li>
  );
}
