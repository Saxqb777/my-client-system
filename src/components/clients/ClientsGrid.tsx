"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { ClientSummary } from "@/lib/data/clients";
import { HEALTH_ORDER } from "@/lib/core/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/aurora/EmptyState";
import { ClientCard } from "./ClientCard";
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
    const filtered = needle
      ? base.filter((c) => [c.name, c.code, c.fullName, c.system, ...(c.aliases ?? [])].filter(Boolean).some((s) => s!.toLowerCase().includes(needle)))
      : base;
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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={cn(
                "pill transition",
                filter === c.key ? "border-border-strong bg-surface-3 text-text" : "hover:border-border-strong hover:text-text",
              )}
            >
              {c.label} <span className="num text-[11px] text-muted">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" className="h-9 w-full pl-9 sm:w-56" />
          </div>
          <Button onClick={() => setOpen(true)} size="sm" className="h-9">
            <Plus /> New client
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="glass">
          <EmptyState
            title={filter === "archived" ? "No archived clients" : q ? "No clients match" : "No clients yet"}
            hint={filter === "archived" ? "Archived clients stay searchable here." : "Add a client to start tracking phases, dates and updates."}
            action={
              filter !== "archived" && !q ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Add your first client
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c, i) => (
            <div key={c.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <ClientCard client={c} />
            </div>
          ))}
        </div>
      )}

      <ClientForm open={open} onOpenChange={setOpen} />
    </>
  );
}
