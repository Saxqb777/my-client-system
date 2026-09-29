"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import { askOrbitAction } from "@/actions/meetingIntel";
import type { AskAnswer } from "@/lib/ai/ask";
import { formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** A question answered from meeting history, with the meetings it came from. */
export function AskOrbit({ clients }: { clients: NavClient[] }) {
  const [question, setQuestion] = useState("");
  const [clientId, setClientId] = useState("all");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    start(async () => {
      const res = await askOrbitAction(question, clientId === "all" ? null : clientId);
      if (!res.ok) toast.error(res.error);
      else setAnswer(res.data);
    });
  }

  return (
    <div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 3) ask();
        }}
      >
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What did ADFH say about the wallet deposit last week?" className="flex-1" />
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending || question.trim().length < 3}>
          {pending ? <Loader2 className="animate-spin" /> : null} Ask
        </Button>
      </form>
      {answer && (
        <div className="mt-4 border-l-2 border-border pl-4">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              {answer.sources.map((s) => (
                <li key={s.meetingId}>
                  <span className="num">{s.label}</span>{" "}
                  <Link href={`/meetings/${s.meetingId}`} className="link">
                    {s.title}
                  </Link>
                  , <span className="num">{formatDate(s.heldAt, false)}</span>
                  {s.clientCode ? `, ${s.clientCode}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
