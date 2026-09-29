"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileDown, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ReportCell, ReportRow, WeeklyReport } from "@/lib/db/schema";
import { generateFridayAction, saveFridayCellAction, setFridayStatusAction } from "@/actions/friday";
import { EDITABLE_CELLS, FRIDAY_COLUMNS, renderTable } from "@/lib/friday/build";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The pack for one week. Cells are edited in place and saved on blur; an edited cell keeps a small mark so you
 * know a regeneration will leave it alone. Wide screens get the seven column table, phones get one card per client.
 */
export function FridayTable({ report, weekStart }: { report: WeeklyReport | null; weekStart: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"generate" | "reset" | null>(null);
  const rows = report?.rows ?? [];

  function generate(reset: boolean) {
    setBusy(reset ? "reset" : "generate");
    start(async () => {
      const res = await generateFridayAction(weekStart, reset);
      setBusy(null);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(reset ? "Pack rebuilt from scratch" : report ? "Pack regenerated, your edits kept" : "Pack generated", { description: res.data.engine === "claude" ? `${res.data.rows} clients, written by Claude` : `${res.data.rows} clients, rule based text (no Claude key)` });
        router.refresh();
      }
    });
  }

  function copyTable() {
    navigator.clipboard.writeText(renderTable(rows)).then(() => toast.success("Table copied. Paste into Teams, Outlook or Excel."));
  }

  function saveCell(row: ReportRow, key: ReportCell, value: string) {
    if (!report) return;
    if (value.trim() === String(row[key] ?? "").trim()) return;
    start(async () => {
      const res = await saveFridayCellAction({ id: report.id, clientId: row.clientId, key, value });
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function setStatus(status: "draft" | "final") {
    if (!report) return;
    start(async () => {
      const res = await setFridayStatusAction(report.id, status);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(status === "final" ? "Marked final" : "Back to draft");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => generate(false)} disabled={pending}>
          {busy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />} {report ? "Regenerate, keep my edits" : "Generate this week"}
        </Button>
        {report && (
          <>
            <Button size="sm" variant="secondary" onClick={() => generate(true)} disabled={pending}>
              {busy === "reset" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={copyTable} disabled={!rows.length}>
              <Copy /> Copy as table
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/friday/${report.id}/docx`} download>
                <FileDown /> Export Word
              </a>
            </Button>
            <button type="button" className="link ml-auto text-[13px]" onClick={() => setStatus(report.status === "final" ? "draft" : "final")} disabled={pending}>
              {report.status === "final" ? "Reopen as draft" : "Mark final"}
            </button>
          </>
        )}
      </div>

      {!report && <p className="py-6 text-[14px] text-muted">No pack for this week yet. Generate reads this week&rsquo;s meetings, activity, tasks, risks and dates for every active client and writes one row each.</p>}

      {report && rows.length === 0 && <p className="py-6 text-[14px] text-muted">No active clients to report on.</p>}

      {rows.length > 0 && (
        <>
          <table className="ledger hidden w-full table-fixed lg:table">
            <thead>
              <tr>
                {FRIDAY_COLUMNS.map((c) => (
                  <th key={c.key} className={cn(c.key === "client" && "w-[130px]", c.key === "owner" && "w-[80px]", (c.key === "startDate" || c.key === "targetDate") && "w-[96px]")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clientId}>
                  {FRIDAY_COLUMNS.map((c) => (
                    <td key={c.key} className={cn("align-top text-[13.5px] leading-snug", c.key === "client" && "serif text-[16px]")}>
                      {c.key === "client" ? r.client : <Cell row={r} cellKey={c.key as ReportCell} onSave={saveCell} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="lg:hidden">
            {rows.map((r) => (
              <li key={r.clientId} className="border-b border-border py-4 last:border-0">
                <p className="serif text-[18px] text-text">{r.client}</p>
                <dl className="mt-2 space-y-2">
                  {FRIDAY_COLUMNS.filter((c) => c.key !== "client").map((c) => (
                    <div key={c.key}>
                      <dt className="text-[12px] text-muted">{c.label}</dt>
                      <dd className="text-[14px] text-text">
                        <Cell row={r} cellKey={c.key as ReportCell} onSave={saveCell} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">Click a cell to edit. A cell you changed is marked and kept when you regenerate. Reset rebuilds everything from the data.</p>
        </>
      )}
    </div>
  );
}

function Cell({ row, cellKey, onSave }: { row: ReportRow; cellKey: ReportCell; onSave: (row: ReportRow, key: ReportCell, value: string) => void }) {
  const edited = row.edited?.includes(cellKey);
  const mono = cellKey === "startDate" || cellKey === "targetDate";
  if (!EDITABLE_CELLS.includes(cellKey)) return <>{row[cellKey]}</>;
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={cellKey}
      onBlur={(e) => onSave(row, cellKey, e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).blur();
        }
      }}
      className={cn("min-h-[1.5em] whitespace-pre-wrap rounded-[2px] px-1 -mx-1 outline-none hover:bg-surface-2 focus:bg-surface-2 focus:shadow-[inset_0_0_0_1px_var(--ink)]", mono && "num text-[12.5px]", edited && "border-l-2 border-border-strong pl-2")}
      title={edited ? "Edited by hand, kept on regenerate" : "Click to edit"}
    >
      {row[cellKey]}
    </div>
  );
}
