"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setOwnerNameAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OwnerNameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setOwnerNameAction(name);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Name saved");
            router.refresh();
          }
        });
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="owner">Your name</Label>
        <Input id="owner" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-[11px] text-muted">Used in greetings and as the default owner on new clients.</p>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || name.trim() === initial}>
        {pending && <Loader2 className="animate-spin" />} Save
      </Button>
    </form>
  );
}
