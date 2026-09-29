"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LibraryMeeting, SearchHit } from "@/lib/data/meetingLibrary";
import type { NavClient } from "@/components/shell/nav";
import { formatDate, formatDateTime } from "@/lib/core/dates";
import { cn } from "@/lib/utils";

const STATE: Record<string, string> = { received: "Queued", processing: "Processing", processed: "Processed", needs_review: "Needs review", failed: "Failed" };

function stateWord(m: LibraryMeeting): string {
  if (m.processing) return STATE[m.processing] ?? m.processing;
  if (m.status === "minuted") return "Minuted";
  if (m.status === "planned") return "Planned";
  if (m.status === "cancelled") return "Cancelled";
  return m.mom ? "Minuted" : "No minutes";
}

/** Search box, then either the hits or the full ledger. Server rendered, filters live in the URL. */
export function MeetingsLedger({ meetings, clients, q, clientFilter, hits }: { meetings: LibraryMeeting[]; clients: NavClient[]; q: string; clientFilter: string; hits: SearchHit[] | null }) {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" action="/meetings" method="get">
        <input name="q" defaultValue={q} placeholder="Search every transcript and minutes" className="h-9 flex-1 border-b border-border-strong bg-transparent px-1 text-[14px] text-text outline-none placeholder:text-muted focus:border-ink" />
        <select name="client" defaultValue={clientFilter} className="h-9 border-b border-border-strong bg-transparent px-1 text-[14px] text-text outline-none focus:border-ink">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="other">Other Work</option>
        </select>
        <button type="submit" className="h-9 border border-ink px-3 text-[13px] text-text">
          Search
        </button>
        {(q || clientFilter) && (
          <Link href="/meetings" className="link text-[13px]">
            Clear
          </Link>
        )}
      </form>

      {hits ? (
        <div>
          <p className="mb-1 text-[13px] text-muted">
            {hits.length} {hits.length === 1 ? "meeting matches" : "meetings match"} &ldquo;{q}&rdquo;
          </p>
          <ul>
            {hits.map((h) => (
              <li key={h.meetingId} className="border-b border-border py-3 last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <span className="num w-[86px] shrink-0 text-[12px] text-muted">{formatDate(h.heldAt, false)}</span>
                  <Link href={`/meetings/${h.meetingId}`} className="text-[15px] text-text hover:underline">
                    {h.title}
                  </Link>
                  <span className="text-[12px] text-muted">{h.clientCode ?? "Other Work"}, found in the {h.where}</span>
                </div>
                <p className="mt-1 text-[13px] text-text-2 sm:pl-[102px]" dangerouslySetInnerHTML={{ __html: escapeSnippet(h.snippet) }} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <table className="ledger w-full">
          <thead>
            <tr>
              <th className="w-[140px]">When</th>
              <th>Meeting</th>
              <th className="hidden sm:table-cell">Client</th>
              <th className="hidden w-[80px] sm:table-cell">Length</th>
              <th className="w-[110px]">State</th>
            </tr>
          </thead>
          <tbody>
            {meetings.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[14px] text-muted">
                  No meetings yet. Add a transcript, or wait for the next one to arrive.
                </td>
              </tr>
            )}
            {meetings.map((m) => (
              <tr
                key={m.id}
                className="cursor-pointer outline-none focus-visible:bg-surface-2"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) return;
                  router.push(`/meetings/${m.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/meetings/${m.id}`);
                }}
              >
                <td className="num text-[12px] text-muted">{formatDateTime(m.heldAt)}</td>
                <td>
                  <Link href={`/meetings/${m.id}`} className="text-[15px] text-text hover:underline">
                    {m.title}
                  </Link>
                  <span className="block text-[12px] text-muted sm:hidden">{m.client?.name ?? (m.otherWork ? "Other Work" : "Unmatched")}</span>
                </td>
                <td className="hidden text-[13px] text-text-2 sm:table-cell">{m.client ? m.client.name : m.otherWork ? "Other Work" : <span className="text-warn">Unmatched</span>}</td>
                <td className="num hidden text-[12px] text-muted sm:table-cell">{m.durationMin ? `${m.durationMin} min` : ""}</td>
                <td className={cn("text-[12px]", m.processing === "failed" ? "text-bad" : m.processing === "needs_review" ? "text-warn" : "text-muted")}>{stateWord(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** ts_headline marks hits with << >>. Everything else is escaped, then the marks become <mark>. */
function escapeSnippet(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/&lt;&lt;/g, '<mark class="bg-transparent font-medium text-text underline decoration-signal underline-offset-2">').replace(/&gt;&gt;/g, "</mark>");
}
