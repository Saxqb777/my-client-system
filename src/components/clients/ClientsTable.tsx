"use client";

import { useRouter } from "next/navigation";
import type { ClientSummary } from "@/lib/data/clients";
import { phaseLabel } from "@/lib/core/constants";
import { daysUntil, formatDate } from "@/lib/core/dates";
import { DaysFigure } from "@/components/aurora/DaysFigure";
import { HealthMark } from "@/components/aurora/HealthMark";
import { Panel } from "@/components/aurora/Panel";
import { EmptyState } from "@/components/aurora/EmptyState";

/**
 * Every client as one line of a ledger. Name, where it is, how it is, what happens next, when.
 */
export function ClientsTable({ clients, title, aside, emptyTitle = "No clients", emptyHint }: { clients: ClientSummary[]; title?: string; aside?: React.ReactNode; emptyTitle?: string; emptyHint?: string }) {
  const router = useRouter();
  const body =
    clients.length === 0 ? (
      <EmptyState title={emptyTitle} hint={emptyHint} compact />
    ) : (
      <table className="ledger">
        <thead>
          <tr>
            <th className="w-[26%]">Client</th>
            <th className="hidden w-[10%] sm:table-cell">Phase</th>
            <th className="hidden w-[12%] sm:table-cell">Health</th>
            <th className="hidden md:table-cell">Next step</th>
            <th className="w-[22%]">Next date</th>
            <th className="hidden w-[9%] text-right lg:table-cell">14 days</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const next = c.nextMilestone;
            return (
              <tr
                key={c.id}
                className="cursor-pointer outline-none focus-visible:bg-surface-2"
                tabIndex={0}
                onClick={() => router.push(`/clients/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/clients/${c.id}`);
                }}
              >
                <td>
                  <p className="serif text-[19px] leading-tight text-text">{c.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    <span className="num">{c.code}</span>
                    <span className="sm:hidden">, {phaseLabel(c.phase)}</span>
                    {c.archivedAt && <span>, archived</span>}
                  </p>
                  <HealthMark health={c.health} className="mt-1 text-[12px] sm:hidden" />
                </td>
                <td className="hidden text-text-2 sm:table-cell">{phaseLabel(c.phase)}</td>
                <td className="hidden sm:table-cell">
                  <HealthMark health={c.health} />
                </td>
                <td className="hidden max-w-0 md:table-cell">
                  <p className="line-clamp-2 text-text-2">{c.nextStep ?? <span className="text-faint">Not set</span>}</p>
                </td>
                <td>
                  {next ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-text">{next.title}</p>
                        <p className="num text-[12px] text-muted">{formatDate(next.date, false)}</p>
                      </div>
                      <DaysFigure daysLeft={daysUntil(next.date)} size="sm" />
                    </div>
                  ) : (
                    <span className="text-faint">No date</span>
                  )}
                </td>
                <td className="num hidden text-right text-text-2 lg:table-cell">{c.activityCount14d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  if (!title) return body;
  return (
    <Panel title={title} aside={aside}>
      {body}
    </Panel>
  );
}
