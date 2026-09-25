"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setClientNotesAction, setMomFormatAction } from "@/actions/meetings";
import { DEFAULT_MOM_FORMAT } from "@/lib/ai/mom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/aurora/Panel";

/**
 * Two living documents per client. Notes: what Orbit knows, updated after every transcript and by hand.
 * MOM format: how this client's minutes must look.
 */
export function NotesPanel({ clientId, notes, momFormat }: { clientId: string; notes: string | null; momFormat: string | null }) {
  return (
    <div className="space-y-10">
      <Editor
        title="Notes"
        hint="Orbit reads these before every meeting and rewrites them after each transcript. Edit freely."
        initial={notes ?? ""}
        placeholder="Who is who, how the client works, what matters, what is sensitive."
        save={(v) => setClientNotesAction(clientId, v)}
        rows={14}
      />
      <Editor
        title="MOM format"
        hint="How this client's minutes must be written. Leave empty to use the Orbit default shown as placeholder."
        initial={momFormat ?? ""}
        placeholder={DEFAULT_MOM_FORMAT}
        save={(v) => setMomFormatAction(clientId, v)}
        rows={10}
      />
    </div>
  );
}

function Editor({ title, hint, initial, placeholder, save, rows }: { title: string; hint: string; initial: string; placeholder: string; save: (v: string) => Promise<{ ok: boolean; error?: string }>; rows: number }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = value !== initial;
  return (
    <Panel title={title} aside={dirty ? "Unsaved" : undefined}>
      <p className="mb-3 text-[13px] text-muted">{hint}</p>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={rows} className="text-[14px] leading-relaxed" />
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await save(value);
              if (!res.ok) toast.error(res.error ?? "Could not save");
              else {
                toast.success(`${title} saved`);
                router.refresh();
              }
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Save
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setValue(initial)}>
            Discard
          </Button>
        )}
      </div>
    </Panel>
  );
}
