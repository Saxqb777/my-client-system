"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import type { LibraryMeeting } from "@/lib/data/meetingLibrary";
import { retryMeetingAction } from "@/actions/meetingIntel";
import { formatDateTime } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { AssignClient } from "./AssignClient";
import { ProcessingWatch } from "./ProcessingWatch";

/** Meetings waiting on Saaqib: unmatched ones to file, failures to retry, and the ones still being processed. */
export function ReviewInbox({ needsReview, failed, inFlight, clients }: { needsReview: LibraryMeeting[]; failed: LibraryMeeting[]; inFlight: LibraryMeeting[]; clients: NavClient[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function retry(id: string) {
    start(async () => {
      const res = await retryMeetingAction(id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Running again");
        router.refresh();
      }
    });
  }
  if (needsReview.length + failed.length + inFlight.length === 0) return null;
  return (
    <div className="space-y-8">
      {needsReview.length > 0 && (
        <section>
          <h3 className="mb-1 border-b border-ink pb-1 text-[13px] font-medium text-warn">Needs review: which client is this?</h3>
          <ul>
            {needsReview.map((m) => (
              <li key={m.id} className="border-b border-border py-3 last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
                  <Link href={`/meetings/${m.id}`} className="text-[15px] text-text hover:underline">
                    {m.title}
                  </Link>
                  {m.durationMin ? <span className="num text-[12px] text-muted">{m.durationMin} min</span> : null}
                </div>
                <p className="mt-1 pl-0 text-[12px] text-muted sm:pl-[148px]">
                  {m.matchReason ?? "No clue in the title, attendees or words."}
                  {typeof m.matchConfidence === "number" ? ` Confidence ${Math.round(m.matchConfidence * 100)}%.` : ""}
                </p>
                <div className="mt-2 sm:pl-[148px]">
                  <AssignClient meetingId={m.id} clients={clients} compact />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {failed.length > 0 && (
        <section>
          <h3 className="mb-1 border-b border-ink pb-1 text-[13px] font-medium text-bad">Failed</h3>
          <ul>
            {failed.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-0">
                <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/meetings/${m.id}`} className="text-[15px] text-text hover:underline">
                    {m.title}
                  </Link>
                  <p className="text-[12px] text-bad">{m.errorMessage ?? "Processing failed"}</p>
                </div>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => retry(m.id)}>
                  <RotateCcw /> Retry
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inFlight.length > 0 && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Being processed</h3>
          <ul>
            {inFlight.map((m) => (
              <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
                <ProcessingWatch meetingId={m.id} state={m.processing} />
                <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
                <Link href={`/meetings/${m.id}`} className="text-[15px] text-text hover:underline">
                  {m.title}
                </Link>
                <span className="text-[12px] text-muted">{m.processing === "processing" ? "Drafting the minutes" : "Queued"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
