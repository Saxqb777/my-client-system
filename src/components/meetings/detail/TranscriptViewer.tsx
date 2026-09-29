"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptSegment } from "@/lib/db/schema";
import { clock, speakerLabel } from "@/lib/meetings/transcript";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The transcript as turns: time, speaker, words. Me is set in ink, others in the second text colour. Search filters lines. */
export function TranscriptViewer({ segments, seek }: { segments: TranscriptSegment[]; seek: number | null }) {
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (needle ? segments.filter((s) => s.text.toLowerCase().includes(needle)) : segments), [segments, needle]);
  const target = useMemo(() => {
    if (seek === null) return -1;
    let best = -1;
    segments.forEach((s, i) => {
      if (s.start <= seek + 0.5) best = i;
    });
    return best;
  }, [segments, seek]);

  useEffect(() => {
    if (target < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-i="${target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target]);

  if (segments.length === 0) return <p className="py-3 text-[14px] text-muted">No transcript on this meeting.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript" className="sm:max-w-[320px]" />
        <span className="num text-[12px] text-muted">
          {needle ? `${shown.length} of ${segments.length} lines` : `${segments.length} lines`}
        </span>
      </div>
      <ol ref={listRef} className="max-h-[70vh] overflow-y-auto border-t border-border">
        {shown.map((s) => {
          const i = segments.indexOf(s);
          const me = s.speaker === "me" || /saaqib/i.test(s.speaker);
          return (
            <li key={`${s.start}-${i}`} data-i={i} className={cn("grid grid-cols-[52px_1fr] gap-3 border-b border-border py-2 sm:grid-cols-[52px_140px_1fr]", i === target && "bg-surface")}>
              <span className="num pt-0.5 text-[11px] text-muted">{clock(s.start)}</span>
              <span className={cn("hidden truncate pt-0.5 text-[12px] sm:block", me ? "font-medium text-text" : "text-muted")}>{speakerLabel(s.speaker)}</span>
              <p className={cn("text-[14px] leading-relaxed", me ? "text-text" : "text-text-2")}>
                <span className={cn("mr-2 text-[12px] sm:hidden", me ? "font-medium text-text" : "text-muted")}>{speakerLabel(s.speaker)}</span>
                {needle ? highlight(s.text, needle) : s.text}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function highlight(text: string, needle: string) {
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = lower.indexOf(needle, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} className="bg-transparent font-medium text-text underline decoration-signal underline-offset-2">
        {text.slice(j, j + needle.length)}
      </mark>,
    );
    i = j + needle.length;
  }
  return parts;
}
