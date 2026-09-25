"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Activity, ActivityType } from "@/lib/db/schema";
import { logActivityAction } from "@/actions/activities";
import { ACTIVITY_TYPES } from "@/lib/core/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useQuickLog } from "@/components/quicklog/QuickLogProvider";

export function ClientTimeline({ clientId, clientCode, activities }: { clientId: string; clientCode: string; activities: Activity[] }) {
  const router = useRouter();
  const quickLog = useQuickLog();
  const [text, setText] = useState("");
  const [type, setType] = useState<ActivityType>("update");
  const [pending, start] = useTransition();

  function submit() {
    if (text.trim().length < 2) return;
    start(async () => {
      const res = await logActivityAction({ clientId, type, title: text.trim(), source: "app" });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Logged");
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[4px] border border-border-strong p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Log an update"
          className="min-h-[64px] border-0 bg-transparent px-1 focus:shadow-none focus:border-0"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
            <SelectTrigger className="h-8 w-36 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => quickLog.open(text ? `${clientCode} ${text}` : `${clientCode} `)} title="Use Quick Log to also move dates and add follow ups">
              Smart log
            </Button>
            <Button size="sm" onClick={submit} disabled={pending || text.trim().length < 2}>
              {pending && <Loader2 className="animate-spin" />} Log
            </Button>
          </div>
        </div>
      </div>
      <ActivityFeed activities={activities} showClient={false} emptyHint="Health, phase and date changes are added here automatically." />
    </div>
  );
}
