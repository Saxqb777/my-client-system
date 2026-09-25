"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { ClientSummary } from "@/lib/data/clients";
import { HEALTH_ORDER } from "@/lib/core/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientsTable } from "./ClientsTable";
import { ClientForm } from "./ClientForm";
import { cn } from "@/lib/utils";

type Filter = "all" | "at_risk" | "blocked" | "archived";

export function ClientsGrid({ clients, archived }: { clients: ClientSummary[]; archived: ClientSummary[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => params.get("new") === "1");

  useEffect(() => {
    if (params.get("new") === "1") router.replace("/clients");
  }, [params, router]);

  const list = useMemo(() => {
    const base = filter === "archived" ? archived : clients.filter((c) => (filter === "all" ? true : c.health === filter));
    const needle = q.trim().toLowerCase();
    const filtered = needle ? base.filter((c) => [c.name, c.code, c.fullName, c.system, ...(c.aliases ?? [])].filter(Boolean).some((s) => s!.toLowerCase().includes(needle))) : base;
    return [...filtered].sort((a, b) => {
      const h = HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health);
      return h !== 0 ? h : a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [clients, archived, filter, q]);

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: clients.length },
    { key: "at_risk", label: "At risk", n: clients.filter((c) => c.health === "at_risk").length },
    { key: "blocked", label: "Blocked", n: clients.filter((c) => c.health === "blocked").length },
    { key: "archived", label: "Archived", n: archived.length },
  ];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6 text-[14px]">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={cn("border-b-2 pb-1 transition-colors", filter === c.key ? "border-ink text-text" : "border-transparent text-muted hover:text-text")}
            >
              {c.label} <span className="num ml-1 text-[12px] text-muted">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-full sm:w-52" />
          <Button onClick={() => setOpen(true)} size="md">
            <Plus /> New client
          </Button>
        </div>
      </div>

      <ClientsTable
        clients={list}
        emptyTitle={filter === "archived" ? "No archived clients" : q ? "No clients match" : "No clients yet"}
        emptyHint={filter === "archived" ? "Archived clients appear here." : "Add a client to start tracking."}
      />

      <ClientForm open={open} onOpenChange={setOpen} />
    </>
  );
}
