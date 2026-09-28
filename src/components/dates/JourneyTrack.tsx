"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Health, Milestone } from "@/lib/db/schema";
import { deleteMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { countdownLabel, delayText, formatDate, type ISODate } from "@/lib/core/dates";
import { dateAt, fractionFor, layoutJourney, monthTicks, type JourneyDomain, type Placed } from "@/lib/core/journey";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddDateDialog, MoveDateDialog } from "./MilestoneDialogs";

export type TrackClient = { id: string; code: string; name: string; phase: string; health: Health };

type Drag = { id: string; startX: number; moved: boolean; fraction: number; date: ISODate };

const RAIL_H = 104;
const MID = RAIL_H / 2;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * One client's journey: a time axis with every date as a mark. Done dates are solid ink, open dates are
 * hollow, the next one up is bigger, an overdue one turns red, go live has a centre dot. The line is drawn
 * solid up to today and dashed beyond. Hover a mark to read it, click to pin it and act, drag it along the
 * rail to move the date (a reason is asked before anything is saved), click empty rail to add a date there.
 */
export function JourneyTrack({ client, milestones, domain, today, variant = "row", className }: { client: TrackClient; milestones: Milestone[]; domain: JourneyDomain; today: ISODate; variant?: "row" | "solo"; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ key: number; date: string } | null>(null);
  const [moving, setMoving] = useState<{ key: number; milestone: Milestone; date: string } | null>(null);

  const visible = milestones.filter((m) => m.status !== "cancelled");
  const placed = layoutJourney(visible, domain, Math.max(width, 1));
  const todayX = fractionFor(today, domain) * 100;
  const nextId = visible.filter((m) => m.status === "upcoming" && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.id ?? null;
  const shown = drag?.moved ? null : (active ?? hover);
  const card = shown ? placed.find((p) => p.item.id === shown) ?? null : null;

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(null);
    }
    function onDown(e: PointerEvent) {
      if (!(e.target instanceof Node) || !ref.current?.contains(e.target)) setActive(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [active, ref]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        toast.success(done);
        setActive(null);
        router.refresh();
      }
    });
  }

  function fractionAt(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function onMarkDown(e: React.PointerEvent<HTMLButtonElement>, m: Milestone) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: m.id, startX: e.clientX, moved: false, fraction: fractionFor(m.date, domain), date: m.date });
  }
  function onMarkMove(e: React.PointerEvent<HTMLButtonElement>, m: Milestone) {
    if (!drag || drag.id !== m.id) return;
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4;
    if (!moved || m.status === "done") return;
    const fraction = fractionAt(e.clientX);
    setDrag({ ...drag, moved: true, fraction, date: dateAt(fraction, domain) });
  }
  function onMarkUp(e: React.PointerEvent<HTMLButtonElement>, m: Milestone) {
    if (!drag || drag.id !== m.id) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const d = drag;
    setDrag(null);
    if (d.moved) {
      if (d.date !== m.date) setMoving({ key: Date.now(), milestone: m, date: d.date });
    } else {
      setActive((a) => (a === m.id ? null : m.id));
    }
  }

  function onRailClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    setAdding({ key: Date.now(), date: dateAt(fractionAt(e.clientX), domain) });
  }

  const ticks = variant === "solo" ? monthTicks(domain) : [];

  return (
    <div className={cn("relative", className)}>
      {variant === "solo" && (
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[13px] text-muted">
            {visible.length === 0 ? "No dates yet. Click the line where the first one falls, or add one." : `${visible.filter((m) => m.status === "upcoming").length} open, ${visible.filter((m) => m.status === "done").length} done. Drag a mark to move its date.`}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setAdding({ key: Date.now(), date: today })}>
            <Plus /> Add a date
          </Button>
        </div>
      )}

      <div
        ref={ref}
        className="relative select-none"
        style={{ height: RAIL_H }}
        onPointerMove={(e) => (e.target === e.currentTarget ? setGuide(fractionAt(e.clientX)) : setGuide(null))}
        onPointerLeave={() => setGuide(null)}
        onClick={onRailClick}
        title={visible.length === 0 ? "Click to add a date" : undefined}
      >
        {/* month guides and labels, solo only (the tracker draws its own header) */}
        {ticks.map((t) => (
          <div key={t.date} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${t.fraction * 100}%` }}>
            <span className="num absolute bottom-0 left-1.5 text-[10px] text-muted">{t.label}</span>
          </div>
        ))}

        {/* the rail: solid to today, dashed after */}
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} style={{ originX: 0, top: MID - 1, width: `${todayX}%` }} className="pointer-events-none absolute left-0 h-[2px] bg-ink" />
        <div className="pointer-events-none absolute border-t border-dashed border-border-strong" style={{ top: MID, left: `${todayX}%`, right: 6 }} />
        <svg className="pointer-events-none absolute right-0 text-ink" style={{ top: MID - 6 }} width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden>
          <path d="M1 1l6 5-6 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* today */}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-ink/50" style={{ left: `${todayX}%` }}>
          {variant === "solo" && <span className="num absolute -top-0 left-1.5 text-[10px] text-text-2">Today</span>}
        </div>

        {/* hover guide for adding */}
        {guide !== null && !drag && (
          <div className="pointer-events-none absolute inset-y-3 w-px border-l border-dashed border-border-strong" style={{ left: `${guide * 100}%` }}>
            <span className="num absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted" style={{ top: MID + 22 }}>
              Add {formatDate(dateAt(guide, domain), false)}
            </span>
          </div>
        )}

        {visible.length === 0 && (
          <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] text-muted" style={{ top: MID + 14 }}>
            No dates yet
          </p>
        )}

        {placed.map((p) => (
          <Mark
            key={p.item.id}
            placed={p}
            client={client}
            today={today}
            isNext={p.item.id === nextId}
            dragging={drag?.id === p.item.id && drag.moved ? drag : null}
            dim={Boolean(shown) && shown !== p.item.id}
            onDown={onMarkDown}
            onMove={onMarkMove}
            onUp={onMarkUp}
            onEnter={() => setHover(p.item.id)}
            onLeave={() => setHover(null)}
            onKey={(e, m) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive((a) => (a === m.id ? null : m.id));
              }
            }}
          />
        ))}

        {card && (
          <Card
            placed={card}
            width={width}
            today={today}
            pinned={active === card.item.id}
            pending={pending}
            onMove={() => setMoving({ key: Date.now(), milestone: card.item, date: card.item.date })}
            onDone={() => run(() => updateMilestoneAction(card.item.id, { status: "done" }), `${card.item.title} done`)}
            onReopen={() => run(() => updateMilestoneAction(card.item.id, { status: "upcoming" }), `${card.item.title} reopened`)}
            onCancel={() => run(() => updateMilestoneAction(card.item.id, { status: "cancelled" }), `${card.item.title} cancelled`)}
            onDelete={() => run(() => deleteMilestoneAction(card.item.id), `${card.item.title} deleted`)}
          />
        )}
      </div>

      {adding && <AddDateDialog key={adding.key} open onOpenChange={(v) => !v && setAdding(null)} clientId={client.id} clientName={client.name} initialDate={adding.date} />}
      {moving && <MoveDateDialog key={moving.key} open onOpenChange={(v) => !v && setMoving(null)} milestone={moving.milestone} clientName={client.name} initialDate={moving.date} />}
    </div>
  );
}

function Mark({ placed, today, isNext, dragging, dim, onDown, onMove, onUp, onEnter, onLeave, onKey }: { placed: Placed<Milestone>; client: TrackClient; today: ISODate; isNext: boolean; dragging: Drag | null; dim: boolean; onDown: (e: React.PointerEvent<HTMLButtonElement>, m: Milestone) => void; onMove: (e: React.PointerEvent<HTMLButtonElement>, m: Milestone) => void; onUp: (e: React.PointerEvent<HTMLButtonElement>, m: Milestone) => void; onEnter: () => void; onLeave: () => void; onKey: (e: React.KeyboardEvent<HTMLButtonElement>, m: Milestone) => void }) {
  const m = placed.item;
  const done = m.status === "done";
  const overdue = !done && m.date < today;
  const moved = Boolean(delayText(m.originalDate, m.date));
  const size = done ? 12 : isNext ? 18 : 14;
  const left = dragging ? `${dragging.fraction * 100}%` : placed.px;
  const date = dragging ? dragging.date : m.date;
  const above = placed.lane === 0;
  const tone = overdue || m.status === "missed" ? "border-bad" : "border-ink";
  return (
    <div className={cn("absolute top-0 h-full w-0 transition-opacity", dim && "opacity-40")} style={{ left }}>
      <button
        type="button"
        aria-label={`${m.title}, ${formatDate(m.date)}${done ? ", done" : overdue ? ", overdue" : ""}`}
        className={cn(
          "absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] bg-bg transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none",
          done ? "border-ink bg-ink" : tone,
          done ? "cursor-pointer" : dragging ? "cursor-grabbing scale-110" : "cursor-grab",
          isNext && !dragging && "shadow-[0_0_0_3px_var(--bg),0_0_0_4px_var(--ink)]",
          isNext && overdue && "shadow-[0_0_0_3px_var(--bg),0_0_0_4px_var(--bad)]",
        )}
        style={{ top: MID, width: size, height: size, touchAction: "none" }}
        onPointerDown={(e) => onDown(e, m)}
        onPointerMove={(e) => onMove(e, m)}
        onPointerUp={(e) => onUp(e, m)}
        onPointerCancel={(e) => onUp(e, m)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onKeyDown={(e) => onKey(e, m)}
      >
        {m.type === "go_live" && !done && <span className={cn("absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full", overdue ? "bg-bad" : "bg-ink")} aria-hidden />}
      </button>
      {(!placed.hidden || dragging) && (
        <div
          className={cn(
            "pointer-events-none absolute flex flex-col whitespace-nowrap",
            above ? "bottom-[calc(50%+14px)]" : "top-[calc(50%+14px)]",
            placed.anchor === "center" || dragging ? "left-0 -translate-x-1/2 items-center" : placed.anchor === "start" ? "left-[10px] items-start" : "right-[10px] items-end",
          )}
        >
          {above && (!placed.compact || dragging) && <span className={cn("max-w-[120px] truncate text-[12px] leading-4", done ? "text-muted" : "text-text")}>{m.title}</span>}
          <span className={cn("num text-[11px] leading-4", dragging ? "text-warn" : overdue ? "text-bad" : moved ? "text-warn" : "text-muted")}>{formatDate(date, false)}</span>
          {!above && (!placed.compact || dragging) && <span className={cn("max-w-[120px] truncate text-[12px] leading-4", done ? "text-muted" : "text-text")}>{m.title}</span>}
        </div>
      )}
    </div>
  );
}

function Card({ placed, width, today, pinned, pending, onMove, onDone, onReopen, onCancel, onDelete }: { placed: Placed<Milestone>; width: number; today: ISODate; pinned: boolean; pending: boolean; onMove: () => void; onDone: () => void; onReopen: () => void; onCancel: () => void; onDelete: () => void }) {
  const m = placed.item;
  const done = m.status === "done";
  const slip = delayText(m.originalDate, m.date);
  const last = m.dateHistory.at(-1);
  const cardW = 272;
  const left = Math.min(Math.max(placed.px - cardW / 2, 0), Math.max(width - cardW, 0));
  const below = placed.lane === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: below ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("float absolute z-20 p-3.5", pinned ? "pointer-events-auto" : "pointer-events-none")}
      style={{ left, width: cardW, ...(below ? { top: MID + 34 } : { bottom: MID + 34 }) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="serif text-[18px] leading-tight text-text">{m.title}</p>
        <span className="shrink-0 text-[11px] text-muted">{MILESTONE_TYPES[m.type].label}</span>
      </div>
      <p className="mt-1.5 text-[13px] text-text-2">
        <span className="num">{formatDate(m.date)}</span>
        {done ? <span className="text-muted">, done</span> : <span className="text-muted">, {countdownLabel(m.date)}</span>}
      </p>
      {slip && (
        <p className="mt-0.5 text-[12px] text-warn">
          Was <span className="num">{formatDate(m.originalDate)}</span>, moved by {slip}
          {last?.reason ? `. ${last.reason}` : ""}
        </p>
      )}
      {!slip && last?.reason && <p className="mt-0.5 text-[12px] text-muted">{last.reason}</p>}
      {pinned ? (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          {!done && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onMove}>
              Move date
            </Button>
          )}
          {done ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onReopen}>
              Reopen
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onDone}>
              Mark done
            </Button>
          )}
          {!done && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[12px] text-bad hover:text-bad" disabled={pending} onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">{done ? "Click for options" : m.date < today ? "Click for options, drag to move" : "Click for options, drag along the line to move"}</p>
      )}
    </motion.div>
  );
}
