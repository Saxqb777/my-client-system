"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { undoChangeAction } from "@/actions/changes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Undo for one change log row. If the field moved again after Orbit set it, the first click shows what it reads
 * now and asks before forcing the old value back.
 */
export function UndoButton({ changeId, undone, label = "Undo", className }: { changeId: string; undone: boolean; label?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [conflict, setConflict] = useState<string | null>(null);

  function run(force: boolean) {
    start(async () => {
      const res = await undoChangeAction(changeId, force);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const r = res.data;
      if (r.ok) {
        setConflict(null);
        toast.success("Undone");
        router.refresh();
      } else if (r.conflict) {
        setConflict(r.message);
      } else {
        toast.error(r.message);
      }
    });
  }

  if (undone) return <span className={cn("text-[12px] text-muted", className)}>Undone</span>;

  if (conflict) {
    return (
      <span className={cn("flex flex-wrap items-center gap-2 text-[12px]", className)}>
        <span className="text-warn">{conflict}</span>
        <Button size="sm" variant="secondary" className="h-7 px-2 text-[12px]" disabled={pending} onClick={() => run(true)}>
          Undo anyway
        </Button>
        <button type="button" className="link" onClick={() => setConflict(null)}>
          Keep
        </button>
      </span>
    );
  }

  return (
    <Button size="sm" variant="ghost" className={cn("h-7 px-2 text-[12px]", className)} disabled={pending} onClick={() => run(false)} aria-label="Undo this change">
      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {label}
    </Button>
  );
}
