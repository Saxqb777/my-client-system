"use client";

import { useState } from "react";
import { Copy, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { Document } from "@/lib/db/schema";
import { formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/aurora/EmptyState";

const GROUPS: { type: Document["type"]; label: string }[] = [
  { type: "mom", label: "Minutes" },
  { type: "brd", label: "BRDs" },
  { type: "test_cases", label: "Test cases" },
  { type: "guide", label: "Guides" },
  { type: "email", label: "Emails" },
  { type: "other", label: "Other" },
];

/** Imported documents are a register: "Status: shared\nDate: 15 Sep 2026\nWhere: Circulated by email". */
function register(content: string): { status?: string; date?: string; where?: string } | null {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^(Status|Date|Where):\s*(.+)$/);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return Object.keys(out).length ? out : null;
}

function DocRow({ d }: { d: Document }) {
  const [open, setOpen] = useState(false);
  const reg = register(d.content);
  const long = !reg && d.content.trim().length > 0;
  const meta = reg ? [reg.status, reg.date, reg.where].filter(Boolean).join(", ") : `Saved ${formatDate(d.createdAt)}`;
  function copy() {
    navigator.clipboard.writeText(d.content).then(() => toast.success("Copied"));
  }
  return (
    <li className="border-b border-border py-3 last:border-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-text">{d.title}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {meta}
            {d.tags.filter((t) => t !== reg?.status && t !== "mom").length ? `, ${d.tags.filter((t) => t !== reg?.status && t !== "mom").join(", ")}` : ""}
          </p>
          {(d.meetingId || long) && (
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {d.meetingId && (
                <a href={`/api/meetings/${d.meetingId}/docx`} className="link inline-flex items-center gap-1.5 text-[13px]" download>
                  <FileDown className="size-3.5" /> Download Word
                </a>
              )}
              {long && (
                <button type="button" className="link text-[13px]" onClick={() => setOpen((v) => !v)}>
                  {open ? "Hide" : "Show"}
                </button>
              )}
            </div>
          )}
          {open && long && (
            <div className="mt-2 border-l-2 border-border pl-4">
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-text">{d.content}</pre>
              <Button variant="secondary" size="sm" className="mt-3" onClick={copy}>
                <Copy /> Copy
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The client's document register: minutes Orbit wrote (with the Word file), and the BRDs, test cases,
 * guides and other files logged from the project chats. Full text search across clients comes in Phase 4.
 */
export function DocumentsPanel({ documents }: { documents: Document[] }) {
  if (documents.length === 0) return <EmptyState title="No documents yet" hint="Minutes you save land here with their Word file. BRDs, test cases and guides follow in Phase 4." compact />;
  const groups = GROUPS.map((g) => ({ ...g, items: documents.filter((d) => d.type === g.type) })).filter((g) => g.items.length);
  return (
    <div className="space-y-8">
      <p className="text-[14px] text-muted">
        {documents.length} {documents.length === 1 ? "document" : "documents"}
        {groups.length > 1 ? `: ${groups.map((g) => `${g.items.length} ${g.label.toLowerCase()}`).join(", ")}` : ""}
      </p>
      {groups.map((g) => (
        <section key={g.type}>
          <h3 className="label mb-1 border-b border-border pb-1">{g.label}</h3>
          <ul>
            {g.items.map((d) => (
              <DocRow key={d.id} d={d} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
