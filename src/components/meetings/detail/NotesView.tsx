"use client";

import type { UnderstandingNotes } from "@/lib/core/notes";
import { clock } from "@/lib/meetings/transcript";

function Stamp({ at, onSeek }: { at: number | null; onSeek: (sec: number) => void }) {
  if (at === null) return null;
  return (
    <button type="button" onClick={() => onSeek(at)} className="num ml-2 text-[11px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text" title="Jump to this moment in the transcript">
      {clock(at)}
    </button>
  );
}

function Block({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  if (empty) return null;
  return (
    <section>
      <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">{title}</h3>
      {children}
    </section>
  );
}

/** Understanding notes, for Saaqib only. Each stamp jumps to the transcript. */
export function NotesView({ notes, onSeek }: { notes: UnderstandingNotes; onSeek: (sec: number) => void }) {
  const li = "py-1.5 text-[14px] leading-relaxed text-text";
  return (
    <div className="space-y-7">
      <Block title="What this meeting was really about" empty={!notes.about.length}>
        <ul className="divide-y divide-border">{notes.about.map((x, i) => <li key={i} className={li}>{x}</li>)}</ul>
      </Block>
      <div className="grid gap-7 lg:grid-cols-2">
        <Block title="What the client wants, stated" empty={!notes.wantsStated.length}>
          <ul className="divide-y divide-border">{notes.wantsStated.map((x, i) => <li key={i} className={li}>{x}</li>)}</ul>
        </Block>
        <Block title="What the client wants, implied" empty={!notes.wantsImplied.length}>
          <ul className="divide-y divide-border">{notes.wantsImplied.map((x, i) => <li key={i} className={li}>{x}</li>)}</ul>
        </Block>
      </div>
      <Block title="What changed since the last meeting" empty={!notes.changedSinceLast.length}>
        <ul className="divide-y divide-border">{notes.changedSinceLast.map((x, i) => <li key={i} className={li}>{x}</li>)}</ul>
      </Block>
      <Block title="Risks, delays and concerns" empty={!notes.concerns.length}>
        <ul className="divide-y divide-border">
          {notes.concerns.map((c, i) => (
            <li key={i} className={li}>
              <span className="text-warn">{c.text}</span>
              {c.raisedBy ? <span className="text-muted"> ({c.raisedBy})</span> : null}
              <Stamp at={c.at} onSeek={onSeek} />
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Asked of me" empty={!notes.askedOfMe.length}>
        <ul className="divide-y divide-border">
          {notes.askedOfMe.map((x, i) => (
            <li key={i} className={`${li} font-medium`}>
              {x.text}
              <Stamp at={x.at} onSeek={onSeek} />
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Unclear, contradicted or left hanging" empty={!notes.unclear.length}>
        <ul className="divide-y divide-border">
          {notes.unclear.map((x, i) => (
            <li key={i} className={li}>
              {x.text}
              <Stamp at={x.at} onSeek={onSeek} />
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Questions to ask next time" empty={!notes.askNextTime.length}>
        <ol className="list-decimal divide-y divide-border pl-5">{notes.askNextTime.map((x, i) => <li key={i} className={li}>{x}</li>)}</ol>
      </Block>
      <Block title="Terms explained" empty={!notes.jargon.length}>
        <dl className="divide-y divide-border">
          {notes.jargon.map((j, i) => (
            <div key={i} className="grid gap-1 py-1.5 sm:grid-cols-[180px_1fr]">
              <dt className="text-[14px] font-medium text-text">{j.term}</dt>
              <dd className="text-[14px] text-text-2">{j.meaning}</dd>
            </div>
          ))}
        </dl>
      </Block>
    </div>
  );
}
