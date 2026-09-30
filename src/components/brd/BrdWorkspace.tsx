"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileDown, Loader2, Search, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import type { BrdDraft, BrdGapCheck, BrdItemKind, BrdLine, BrdSections, GapFinding } from "@/lib/db/schema";
import type { BrdItemWithMeeting } from "@/lib/data/brd";
import { extractBrdAction, gapCheckAction, markCoveredAction, setBrdItemStatusAction, writeBrdDraftAction } from "@/actions/brd";
import { ITEM_KINDS, KIND_ORDER, realTopic } from "@/lib/brd/extract";
import { BRD_SECTIONS, LINE_SECTIONS } from "@/lib/brd/draft";
import { GAP_KINDS } from "@/lib/brd/gap";
import { formatDate, formatDateTime } from "@/lib/core/dates";
import { clock } from "@/lib/meetings/transcript";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  clientName: string;
  items: BrdItemWithMeeting[];
  counts: { readable: number; read: number };
  draft: BrdDraft | null;
  draftText: string;
  drafts: { id: string; version: number; createdAt: Date }[];
  gap: BrdGapCheck | null;
};

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-ink pb-2">
        <h2 className="section-title">{title}</h2>
        {aside && <div className="label pb-0.5 text-right">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function SourceLink({ meeting, at, quote }: { meeting: { id: string; title: string; heldAt: Date } | null; at: number | null; quote?: string | null }) {
  if (!meeting) return null;
  const href = `/meetings/${meeting.id}${at !== null && at !== undefined ? `?tab=transcript&t=${Math.floor(at)}` : ""}`;
  return (
    <Link href={href} className="hover:underline" title={quote ? `“${quote}”` : undefined}>
      {meeting.title}, {formatDate(meeting.heldAt, false)}
      {at !== null && at !== undefined ? <span className="num">, {clock(at)}</span> : null}
    </Link>
  );
}

/** The BRD workspace for one client: requirements pulled from meetings, the draft BRD, and a gap check of an existing BRD. */
export function BrdWorkspace({ clientId, clientName, items, counts, draft, draftText, drafts, gap }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<BrdItemKind | "all">("all");
  const [showDropped, setShowDropped] = useState(false);
  const unread = counts.readable - counts.read;
  const byId = new Map(items.map((i) => [i.id, i]));
  const live = items.filter((i) => i.status !== "dropped");
  const dropped = items.filter((i) => i.status === "dropped");
  const shown = live.filter((i) => kind === "all" || i.kind === kind);
  const grouped = new Map<string, BrdItemWithMeeting[]>();
  for (const i of shown) {
    const g = realTopic(i.groupName) ?? "Other";
    grouped.set(g, [...(grouped.get(g) ?? []), i]);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) => (a[0] === "Other" ? 1 : b[0] === "Other" ? -1 : a[0].localeCompare(b[0])));

  function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    start(async () => {
      await fn();
      setBusy(null);
      router.refresh();
    });
  }

  function extract(all: boolean) {
    act(all ? "reread" : "read", async () => {
      const res = await extractBrdAction(clientId, all);
      if (!res.ok) return void toast.error(res.error);
      const r = res.data;
      if (r.read === 0) return void toast("Every meeting is already read");
      toast.success(`${r.added} new ${r.added === 1 ? "item" : "items"} from ${r.read} ${r.read === 1 ? "meeting" : "meetings"}`, {
        description: [r.skipped ? `${r.skipped} repeated an item already listed` : "", r.remaining ? `${r.remaining} meetings left, press again` : "", r.engine === "rules" ? "Rule based reading, no Claude key" : ""].filter(Boolean).join(". "),
      });
    });
  }

  function setStatus(id: string, status: "open" | "dropped") {
    act(`item:${id}`, async () => {
      const res = await setBrdItemStatusAction(id, status);
      if (!res.ok) toast.error(res.error);
    });
  }

  function writeDraft() {
    act("draft", async () => {
      const res = await writeBrdDraftAction(clientId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Draft v${res.data.version} written`, { description: res.data.engine === "claude" ? "Written by Claude from the items" : "Assembled from the items, no Claude key" });
    });
  }

  return (
    <div className="space-y-12">
      <Section
        title="Requirements from meetings"
        aside={
          <>
            {live.length} {live.length === 1 ? "item" : "items"}, read {counts.read} of {counts.readable} {counts.readable === 1 ? "meeting" : "meetings"}
          </>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => extract(false)} disabled={pending || unread === 0}>
            {busy === "read" ? <Loader2 className="animate-spin" /> : <Sparkles />} {unread === 0 ? "All meetings read" : `Read ${Math.min(unread, 8)} ${unread === 1 ? "meeting" : "meetings"}`}
          </Button>
          {counts.read > 0 && (
            <button type="button" className="link text-[13px]" onClick={() => extract(true)} disabled={pending}>
              {busy === "reread" ? "Reading again" : "Read all again"}
            </button>
          )}
          <span className="text-[12px] text-muted">Items that repeat one already listed are skipped. Drop what does not belong.</span>
        </div>

        {live.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <button type="button" onClick={() => setKind("all")} className={cn(kind === "all" ? "text-text underline underline-offset-4" : "text-muted hover:text-text")}>
              All <span className="num text-[12px]">{live.length}</span>
            </button>
            {KIND_ORDER.map((k) => {
              const n = live.filter((i) => i.kind === k).length;
              if (!n) return null;
              return (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn(kind === k ? "text-text underline underline-offset-4" : "text-muted hover:text-text")}>
                  {ITEM_KINDS[k].plural} <span className="num text-[12px]">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-4 text-[14px] text-muted">
            {counts.readable === 0 ? "No minuted meetings for this client yet. Requirements are read from meetings with a transcript or minutes." : "Nothing read yet. Read the meetings to list every requirement, rule, exception, integration and pain point, each with the meeting and the words it came from."}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map(([group, list]) => (
              <div key={group}>
                <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">{group}</h3>
                <ul>
                  {list.map((i) => (
                    <li key={i.id} className="group grid grid-cols-[1fr_auto] gap-x-3 border-b border-border py-2.5 last:border-0">
                      <div className="min-w-0">
                        <p className="text-[14px] leading-snug text-text">{i.text}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2.5 text-[12px] text-muted">
                          <span className={i.kind === "pain_point" ? "text-warn" : ""}>{ITEM_KINDS[i.kind].label}</span>
                          <SourceLink meeting={i.meeting} at={i.evidenceAt} quote={i.evidenceQuote} />
                          {i.status === "covered" && <span className="text-ok">Covered by the BRD</span>}
                        </p>
                        {i.evidenceQuote && <p className="mt-1 line-clamp-2 border-l border-border-strong pl-2.5 text-[12.5px] italic text-text-2">&ldquo;{i.evidenceQuote}&rdquo;</p>}
                      </div>
                      <button type="button" onClick={() => setStatus(i.id, "dropped")} disabled={pending} className="link self-start text-[12px] text-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                        Drop
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {dropped.length > 0 && (
              <div>
                <button type="button" className="link text-[13px] text-muted" onClick={() => setShowDropped(!showDropped)}>
                  {showDropped ? "Hide" : "Show"} {dropped.length} dropped
                </button>
                {showDropped && (
                  <ul className="mt-2">
                    {dropped.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                        <p className="text-[13.5px] text-muted line-through">{i.text}</p>
                        <button type="button" className="link shrink-0 text-[12px]" onClick={() => setStatus(i.id, "open")} disabled={pending}>
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Draft BRD" aside={draft ? `v${draft.version}, ${formatDateTime(draft.createdAt)}, ${draft.model === "rules" ? "assembled from the items" : "written by Claude"}` : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={writeDraft} disabled={pending || live.length === 0}>
            {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} {draft ? "Write a new version" : "Write the draft"}
          </Button>
          {draft && (
            <>
              <Button size="sm" variant="secondary" asChild>
                <a href={`/api/brd/${draft.id}/docx`} download>
                  <FileDown /> Word
                </a>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(draftText).then(() => toast.success("Draft copied"))}>
                <Copy /> Copy text
              </Button>
            </>
          )}
          {drafts.length > 1 && (
            <span className="text-[12px] text-muted">
              Earlier:{" "}
              {drafts
                .filter((d) => d.id !== draft?.id)
                .slice(0, 5)
                .map((d, n) => (
                  <span key={d.id}>
                    {n ? ", " : ""}
                    <a href={`/api/brd/${d.id}/docx`} className="link" download>
                      v{d.version}
                    </a>
                  </span>
                ))}
            </span>
          )}
        </div>
        {!draft ? (
          <p className="py-4 text-[14px] text-muted">{live.length ? "Write the draft to turn the items into the thirteen BRD sections. Every requirement line keeps a link to the meeting it came from." : "Read the meetings first. The draft is written from the items."}</p>
        ) : (
          <DraftView sections={draft.sections} byId={byId} />
        )}
      </Section>

      <Section title="Gap check" aside={gap ? `${gap.sourceName}, ${formatDateTime(gap.createdAt)}, ${gap.findings.length} ${gap.findings.length === 1 ? "finding" : "findings"}` : undefined}>
        <GapForm clientId={clientId} disabled={live.length === 0} />
        {gap && <GapResults check={gap} byId={byId} clientId={clientId} />}
      </Section>
      <p className="text-[12px] text-muted">BRD work for {clientName} stays in Orbit until you download or copy it.</p>
    </div>
  );
}

function DraftView({ sections, byId }: { sections: BrdSections; byId: Map<string, BrdItemWithMeeting> }) {
  return (
    <article className="max-w-[860px] space-y-6">
      {BRD_SECTIONS.map((sec, n) => {
        const v = sections[sec.key];
        return (
          <section key={sec.key}>
            <h3 className="mb-1.5 border-b border-border pb-1 font-display text-[17px] text-text">
              <span className="num mr-2 text-[13px] text-muted">{n + 1}</span>
              {sec.title}
            </h3>
            {typeof v === "string" ? (
              <p className="text-[14px] leading-relaxed text-text">{v || <span className="text-muted">None recorded.</span>}</p>
            ) : sec.key === "stakeholders" ? (
              (v as BrdSections["stakeholders"]).length ? (
                <ul className="text-[14px]">
                  {(v as BrdSections["stakeholders"]).map((p, i) => (
                    <li key={i} className="py-0.5">
                      {p.name}
                      <span className="text-muted">
                        {p.role ? `, ${p.role}` : ""}
                        {p.side ? `, ${p.side}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-muted">None recorded.</p>
              )
            ) : LINE_SECTIONS.some((l) => l.key === sec.key) ? (
              (v as BrdLine[]).length ? (
                <ul>
                  {(v as BrdLine[]).map((l) => (
                    <li key={l.id} className="grid grid-cols-[52px_1fr] gap-x-2 border-b border-border py-2 last:border-0">
                      <span className="num pt-[2px] text-[12px] text-muted">{l.id}</span>
                      <div className="min-w-0">
                        <p className="text-[14px] leading-snug text-text">{l.text}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
                          {l.itemIds.map((id) => {
                            const it = byId.get(id);
                            return it ? <SourceLink key={id} meeting={it.meeting} at={it.evidenceAt} quote={it.evidenceQuote} /> : null;
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-muted">None recorded.</p>
              )
            ) : (v as string[]).length ? (
              <ul className="list-disc space-y-1 pl-5 text-[14px] text-text">
                {(v as string[]).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">None recorded.</p>
            )}
          </section>
        );
      })}
    </article>
  );
}

function GapForm({ clientId, disabled }: { clientId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("text", text);
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("file", file);
    start(async () => {
      const res = await gapCheckAction(fd);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data.findings} ${res.data.findings === 1 ? "finding" : "findings"}`, { description: res.data.engine === "claude" ? "Checked by Claude against the meeting items" : "Rule based check, no Claude key" });
      setText("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="mb-6 space-y-2">
      <p className="text-[13px] text-muted">Paste the client&rsquo;s BRD or choose its Word file. Orbit lists what the meetings said that the BRD misses, what it contradicts, and lines that need a measure or a name.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the BRD text here" className="min-h-[120px] text-[13px] leading-relaxed" disabled={disabled} />
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".docx,.txt,.md" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={disabled}>
          <Upload /> Choose a file
        </Button>
        <span className="text-[12px] text-muted">{fileName || ".docx, .txt or .md"}</span>
        <Button size="sm" className="ml-auto" onClick={submit} disabled={disabled || pending || (text.trim().split(/\s+/).length < 20 && !fileName)}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />} Check against the meetings
        </Button>
      </div>
      {disabled && <p className="text-[12px] text-muted">Read the meetings first, the check compares against those items.</p>}
    </div>
  );
}

function GapResults({ check, byId, clientId }: { check: BrdGapCheck; byId: Map<string, BrdItemWithMeeting>; clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const kinds: GapFinding["kind"][] = ["contradiction", "missing", "vague"];
  const missing = new Set(check.findings.filter((f) => f.kind === "missing" && f.itemId).map((f) => f.itemId!));
  const coverable = Array.from(byId.values()).filter((i) => i.status === "open" && i.kind !== "pain_point" && !missing.has(i.id)).length;

  function markCovered() {
    start(async () => {
      const res = await markCoveredAction(check.id, clientId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data.marked} items marked covered`);
      router.refresh();
    });
  }

  if (!check.findings.length) return <p className="py-3 text-[14px] text-muted">No gaps found. Every item from the meetings is covered and no line needs clarity.</p>;
  return (
    <div className="space-y-6">
      {kinds.map((k) => {
        const list = check.findings.filter((f) => f.kind === k);
        if (!list.length) return null;
        return (
          <div key={k}>
            <h3 className="mb-0.5 border-b border-border pb-1 font-display text-[17px] text-text">
              {GAP_KINDS[k].label} <span className="num text-[13px] text-muted">{list.length}</span>
            </h3>
            <p className="py-1 text-[12px] text-muted">{GAP_KINDS[k].hint}</p>
            <ul>
              {list.map((f, n) => {
                const item = f.itemId ? byId.get(f.itemId) : undefined;
                return (
                  <li key={n} className="border-b border-border py-2.5 last:border-0">
                    <p className={cn("text-[14px] leading-snug", k === "contradiction" ? "text-bad" : k === "vague" ? "text-warn" : "text-text")}>{f.text}</p>
                    {f.brdLine && k !== "contradiction" && <p className="mt-1 text-[12.5px] text-text-2">In the BRD: &ldquo;{f.brdLine}&rdquo;</p>}
                    {(f.quote || item) && (
                      <p className="mt-1 text-[12px] text-muted">
                        {f.quote ? <span className="italic text-text-2">Said: &ldquo;{f.quote}&rdquo; </span> : null}
                        {item && <SourceLink meeting={item.meeting} at={item.evidenceAt} />}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {coverable > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[13px]">
          <span className="text-muted">The checked BRD covers {coverable} open {coverable === 1 ? "item" : "items"}.</span>
          <button type="button" className="link" onClick={markCovered} disabled={pending}>
            Mark them covered
          </button>
        </div>
      )}
    </div>
  );
}
