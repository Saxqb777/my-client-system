"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clearDemoDataAction, loadDemoDataAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export function DemoDataCard({ loaded }: { loaded: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          Demo data {loaded ? <Badge tone="violet">Loaded</Badge> : <Badge>Not loaded</Badge>}
        </p>
        <p className="mt-1 max-w-md text-xs text-muted">
          Sample activities, dates, tasks and people on the eight clients. Clearing keeps the client names and removes everything marked demo.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await loadDemoDataAction();
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Demo data loaded", { description: `${res.data.inserted} rows added` });
                router.refresh();
              }
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Database />} {loaded ? "Reload demo data" : "Load demo data"}
        </Button>
        <Button variant="danger" size="sm" disabled={pending || !loaded} onClick={() => setConfirm(true)}>
          <Eraser /> Clear demo data
        </Button>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear demo data?</DialogTitle>
            <DialogDescription>
              This removes every activity, task, date and person marked as demo, and resets the demo status fields on your clients. The eight client records stay. Anything you added yourself stays.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await clearDemoDataAction();
                  setConfirm(false);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Demo data cleared", { description: `${res.data.removed} rows removed or reset` });
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Clear demo data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
