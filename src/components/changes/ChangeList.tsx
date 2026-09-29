import Link from "next/link";
import type { ChangeWithLinks } from "@/lib/data/changeLog";
import { displayValue } from "@/lib/core/changes";
import { formatDayHeading, formatTime, toISODate } from "@/lib/core/dates";
import { clock } from "@/lib/meetings/transcript";
import { EmptyState } from "@/components/aurora/EmptyState";
import { UndoButton } from "./UndoButton";
import { cn } from "@/lib/utils";

/** Fields whose before and after are too long or meaningless to print. */
const NO_DIFF = new Set(["created", "risk", "notes", "linked"]);

export function ChangeRow({ change, showClient = true, showMeeting = true, compact }: { change: ChangeWithLinks; showClient?: boolean; showMeeting?: boolean; compact?: boolean }) {
  const undone = Boolean(change.undoneAt);
  const showDiff = !NO_DIFF.has(change.field);
  return (
    <li className={cn("grid grid-cols-[48px_1fr] items-start gap-x-3 border-b border-border last:border-0 sm:grid-cols-[48px_1fr_auto]", compact ? "py-2" : "py-3")}>
      <span className="num pt-[3px] text-[12px] text-muted">{formatTime(change.appliedAt)}</span>
      <div className="min-w-0">
        <p className={cn("text-text", compact ? "text-[13px]" : "text-[14.5px]", undone && "text-muted line-through")}>{change.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted">
          {showClient && change.client && (
            <Link href={`/clients/${change.client.id}`} className="num text-text-2 hover:underline">
              {change.client.code}
            </Link>
          )}
          {showMeeting && change.meeting && (
            <Link href={`/meetings/${change.meeting.id}`} className="hover:underline">
              {change.meeting.title}
            </Link>
          )}
          {showDiff && (
            <span>
              Before: {displayValue(change.field, change.oldValue)}. After: {displayValue(change.field, change.newValue)}.
            </span>
          )}
          {change.reason && !showDiff ? <span>{change.reason}</span> : null}
          {undone && <span>Undone {formatTime(change.undoneAt!)}</span>}
        </p>
        {change.evidenceQuote && !compact && (
          <blockquote className="mt-1.5 max-w-3xl border-l border-border-strong pl-3 text-[13px] leading-relaxed text-text-2">
            <span className="serif-italic text-[14px]">&ldquo;{change.evidenceQuote}&rdquo;</span>
            {change.meeting && change.evidenceAt !== null && (
              <Link href={`/meetings/${change.meeting.id}?tab=transcript&t=${Math.floor(change.evidenceAt)}`} className="num ml-2 text-[11px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text" title="Open this moment in the transcript">
                {clock(change.evidenceAt)}
              </Link>
            )}
          </blockquote>
        )}
      </div>
      <div className="col-start-2 mt-1 sm:col-start-3 sm:mt-0">
        <UndoButton changeId={change.id} undone={undone} />
      </div>
    </li>
  );
}

/** Change rows grouped by day, newest first. */
export function ChangeList({ changes, showClient = true, showMeeting = true, emptyHint }: { changes: ChangeWithLinks[]; showClient?: boolean; showMeeting?: boolean; emptyHint?: string }) {
  if (changes.length === 0) {
    return <EmptyState title="No changes yet" hint={emptyHint ?? "When Orbit changes a client from a meeting by itself, it is listed here with the words that justified it and an Undo."} compact />;
  }
  const groups: { key: string; label: string; items: ChangeWithLinks[] }[] = [];
  for (const c of changes) {
    const key = toISODate(c.appliedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(c);
    else groups.push({ key, label: formatDayHeading(c.appliedAt), items: [c] });
  }
  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="num sticky top-12 z-10 border-b border-ink bg-bg pb-1.5 pt-1 text-[12px] text-text lg:top-0">{g.label}</h3>
          <ul>
            {g.items.map((c) => (
              <ChangeRow key={c.id} change={c} showClient={showClient} showMeeting={showMeeting} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
