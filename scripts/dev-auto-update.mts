/**
 * Local only. Gives the ingested fixture meeting in the PGlite dev database a proposal with real evidence
 * and runs the automatic pass, so the Changes page, the Review tab and the home digest have rows to show.
 * Usage: DATABASE_URL=pglite://./.pglite-dev pnpm tsx scripts/dev-auto-update.mts
 */
import { eq, like } from "drizzle-orm";

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { meetings, milestones, clients } = await import("../src/lib/db/schema");
  const { runAutoUpdates } = await import("../src/lib/meetings/autoUpdate");
  const db = await getDb();
  const meeting = await db.query.meetings.findFirst({ where: like(meetings.title, "ADFH x Fero BRD Session 2%"), with: { client: true, transcript: true } });
  if (!meeting || !meeting.client || !meeting.transcript) throw new Error("Fixture meeting not found. Ingest tests/fixtures/sample-ingest.json first.");
  const existing = await db.query.milestones.findMany({ where: eq(milestones.clientId, meeting.client.id) });
  if (!existing.some((m) => m.type === "target")) {
    await db.insert(milestones).values({ clientId: meeting.client.id, title: "BRD sign off", type: "target", date: "2026-10-09", originalDate: "2026-10-01" });
  }
  await db.update(clients).set({ health: "on_track" }).where(eq(clients.id, meeting.client.id));
  const text = meeting.transcript.fullText;
  const pick = (needle: string) => {
    const i = text.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) throw new Error(`Quote not in transcript: ${needle}`);
    return needle;
  };
  const seg = (needle: string) => meeting.transcript!.segments.find((s) => s.text.toLowerCase().includes(needle.toLowerCase()))?.start ?? null;
  const proposal = {
    tasks: [{ title: "Add the wallet ledger view to the BRD", dueDate: "2026-10-02", waitingOn: null, priority: "normal" as const, evidence: { quote: pick("I will add the ledger view to the BRD"), at: seg("ledger view to the BRD") } }],
    dateChanges: [{ type: "target", title: "BRD sign off", newDate: "2026-10-14", markDone: false, evidence: null }],
    health: "at_risk" as const,
    healthReason: "Time bands in the rate matrix are a change to the model",
    healthEvidence: { quote: pick("Time bands would be a change to the matrix model"), at: seg("Time bands would be a change") },
    nextStep: "Confirm the effort for time bands with the team",
    nextStepEvidence: { quote: pick("I will confirm the effort with the team"), at: seg("confirm the effort with the team") },
    phaseDates: null,
    risks: [{ text: "Parking revenue will not match the board approval without time bands", status: "new" as const, evidence: { quote: pick("Without time bands the parking revenue will not match what the board approved"), at: seg("parking revenue will not match") } }],
    doneItems: [],
    notesUpdate: "",
    decisions: ["Keep three customer tiers"],
    summary: "Rate matrix, customer tiers and wallet configuration for the OMS.",
    openQuestions: ["Whether the fourth tier for government entities is needed later"],
    reviewedAt: null,
    autoApplied: null,
  };
  await db.update(meetings).set({ minutes: { ...(meeting.minutes ?? { objective: "", points: [] }), proposal }, actionItems: [...meeting.actionItems, { text: "Share the portal wireframe for the wallet page", owner: "Karim Yousef", due: "2026-10-01", evidence: { quote: pick("can you share the portal wireframe for the wallet page by Thursday"), at: seg("portal wireframe") } }] }).where(eq(meetings.id, meeting.id));
  const result = await runAutoUpdates(meeting.id);
  console.log("meeting", meeting.id, "applied", result.applied, "held", result.held);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
