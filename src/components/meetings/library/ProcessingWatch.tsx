"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a meeting is received or processing, asks for its status every few seconds and refreshes the page when it changes. */
export function ProcessingWatch({ meetingId, state }: { meetingId: string; state: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (state !== "received" && state !== "processing") return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { processing: string | null };
        if (!stopped && data.processing !== state) router.refresh();
      } catch {
        // network blip, try again on the next tick
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [meetingId, state, router]);
  return null;
}
