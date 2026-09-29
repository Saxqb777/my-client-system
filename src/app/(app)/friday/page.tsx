import type { Metadata } from "next";
import Link from "next/link";
import { getReport, listReportWeeks } from "@/lib/data/reports";
import { addDaysISO, formatDateTime, meetingWeek } from "@/lib/core/dates";
import { weekLabel } from "@/lib/friday/build";
import { PageHeader } from "@/components/aurora/PageHeader";
import { FridayTable } from "@/components/friday/FridayTable";

export const metadata: Metadata = { title: "Friday pack" };

/** The weekly status table. The week is a Friday to Thursday, picked in the URL as ?week=yyyy-MM-dd (the Friday). */
export default async function FridayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const current = meetingWeek();
  const raw = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : current.start;
  // Snap any date to the Friday that starts its reporting week.
  const d = new Date(`${raw}T00:00:00Z`);
  const sinceFriday = (d.getUTCDay() - 5 + 7) % 7;
  const weekStart = addDaysISO(raw, -sinceFriday);
  const weekEnd = addDaysISO(weekStart, 6);
  const [report, weeks] = await Promise.all([getReport(weekStart), listReportWeeks(8)]);
  const isCurrent = weekStart === current.start;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Friday pack"
        description={
          <>
            Week {weekLabel(weekStart, weekEnd)}
            {isCurrent ? ", this week" : ""}
            {report ? `. ${report.status === "final" ? "Final" : "Draft"}, updated ${formatDateTime(report.updatedAt)}, ${report.generatedBy.startsWith("claude") ? "written by Claude" : "rule based text"}.` : ". Not generated yet."}
          </>
        }
        actions={
          <div className="flex items-center gap-3 text-[13px]">
            <Link href={`/friday?week=${addDaysISO(weekStart, -7)}`} className="link">
              Previous week
            </Link>
            {!isCurrent && (
              <Link href="/friday" className="link">
                This week
              </Link>
            )}
            <Link href={`/friday?week=${addDaysISO(weekStart, 7)}`} className="link">
              Next week
            </Link>
          </div>
        }
      />
      <FridayTable report={report} weekStart={weekStart} />
      {weeks.length > 0 && (
        <section className="mt-12">
          <h2 className="section-title border-b border-ink pb-2">Earlier packs</h2>
          <ul>
            {weeks.map((w) => (
              <li key={w.id} className="flex items-baseline gap-4 border-b border-border py-2.5 text-[14px] last:border-0">
                <Link href={`/friday?week=${w.weekStart}`} className={w.weekStart === weekStart ? "font-medium text-text" : "link"}>
                  {weekLabel(w.weekStart, w.weekEnd)}
                </Link>
                <span className="text-[12px] text-muted">{w.status === "final" ? "Final" : "Draft"}</span>
                <span className="num ml-auto text-[12px] text-muted">{formatDateTime(w.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
