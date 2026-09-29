import Link from "next/link";
import type { Digest } from "@/lib/data/digest";
import { formatDate, formatTime } from "@/lib/core/dates";
import { Panel } from "@/components/aurora/Panel";
import { ChangeRow } from "@/components/changes/ChangeList";

/**
 * Today from your meetings: what was processed, what Orbit changed (with Undo), the tasks it gave you,
 * and what waits for you. Renders nothing on a quiet day.
 */
export function DigestPanel({ digest }: { digest: Digest }) {
  if (digest.empty) return null;
  const live = digest.changes.filter((c) => !c.undoneAt);
  const parts: string[] = [];
  if (digest.processed.length) parts.push(`${digest.processed.length} ${digest.processed.length === 1 ? "meeting" : "meetings"} processed`);
  if (live.length) parts.push(`${live.length} ${live.length === 1 ? "change" : "changes"} applied`);
  if (digest.newTasks.length) parts.push(`${digest.newTasks.length} new ${digest.newTasks.length === 1 ? "task" : "tasks"} for you`);
  if (digest.needsReview.length) parts.push(`${digest.needsReview.length} to review`);
  if (digest.failed.length) parts.push(`${digest.failed.length} failed`);

  return (
    <Panel title="Today from your meetings" aside={parts.join(", ")}>
      {(digest.needsReview.length > 0 || digest.failed.length > 0) && (
        <ul className="border-b border-border py-1">
          {digest.needsReview.map((m) => (
            <li key={m.id} className="py-1.5 text-[13.5px]">
              <Link href={`/meetings/${m.id}`} className="text-warn hover:underline">
                Needs a client: {m.title}
              </Link>
            </li>
          ))}
          {digest.failed.map((m) => (
            <li key={m.id} className="py-1.5 text-[13.5px]">
              <Link href={`/meetings/${m.id}`} className="text-bad hover:underline">
                Failed: {m.title}
              </Link>
              <span className="text-[12px] text-muted">{m.errorMessage ? `. ${m.errorMessage}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {digest.processed.length > 0 && (
        <ul className="border-b border-border py-1">
          {digest.processed.map((m) => (
            <li key={m.id} className="flex items-baseline gap-3 py-1.5 text-[13.5px]">
              <span className="num w-[44px] shrink-0 text-[12px] text-muted">{m.processedAt ? formatTime(m.processedAt) : ""}</span>
              <span className="min-w-0">
                <Link href={`/meetings/${m.id}`} className="text-text hover:underline">
                  {m.title}
                </Link>
                <span className="text-[12px] text-muted"> minutes ready{m.client ? `, ${m.client.code}` : m.otherWork ? ", Other Work" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {digest.changes.length > 0 && (
        <ul className="border-b border-border">
          {digest.changes.slice(0, 8).map((c) => (
            <ChangeRow key={c.id} change={c} compact />
          ))}
        </ul>
      )}
      {digest.changes.length > 8 && (
        <p className="py-2 text-[12px]">
          <Link href="/changes" className="link">
            All {digest.changes.length} changes today
          </Link>
        </p>
      )}

      {digest.newTasks.length > 0 && (
        <ul className="py-1">
          {digest.newTasks.map((t) => (
            <li key={t.id} className="py-1.5 text-[13.5px]">
              <Link href="/tasks" className="text-text hover:underline">
                {t.status === "waiting" ? `Waiting on ${t.waitingOn}: ` : ""}
                {t.title}
              </Link>
              <span className="text-[12px] text-muted">
                {t.client ? ` ${t.client.code}` : ""}
                {t.dueDate ? `, due ${formatDate(t.dueDate, false)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
