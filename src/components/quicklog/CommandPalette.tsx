"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Activity, Building2, LogOut, Moon, Orbit, Plus, Settings, Sparkles, Sun } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { HealthOrb } from "@/components/aurora/HealthOrb";
import type { NavClient } from "@/components/shell/nav";

export function CommandPalette({
  open,
  onOpenChange,
  clients,
  onLog,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: NavClient[];
  onLog: (text: string) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const canLog = query.trim().length > 2;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent hideClose className="top-[12%] max-w-xl translate-y-0 p-0 sm:top-[18%]">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={!canLog || true} loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Type an update, a client or a page" />
          <CommandList>
            <CommandEmpty>No match. Press Enter to log it as an update.</CommandEmpty>
            {canLog && (
              <CommandGroup heading="Quick log">
                <CommandItem value={`log ${query}`} onSelect={() => onLog(query)} className="data-[selected=true]:bg-[color-mix(in_oklab,var(--teal)_14%,transparent)]">
                  <Sparkles className="!text-teal" />
                  <span className="truncate">
                    Log update: <span className="text-text-2">{query}</span>
                  </span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => go("/")}>
                <Orbit /> Orbit view
              </CommandItem>
              <CommandItem onSelect={() => go("/clients")}>
                <Building2 /> Clients
              </CommandItem>
              <CommandItem onSelect={() => go("/activity")}>
                <Activity /> Activity log
              </CommandItem>
              <CommandItem onSelect={() => go("/settings")}>
                <Settings /> Settings
              </CommandItem>
            </CommandGroup>
            {clients.length > 0 && (
              <CommandGroup heading="Clients">
                {clients.map((c) => (
                  <CommandItem key={c.id} value={`${c.code} ${c.name}`} onSelect={() => go(`/clients/${c.id}`)}>
                    <HealthOrb health={c.health} pulse={false} />
                    <span>{c.name}</span>
                    <span className="num ml-1 text-xs text-muted">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => go("/clients?new=1")}>
                <Plus /> New client
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setTheme(resolvedTheme === "light" ? "dark" : "light");
                  onOpenChange(false);
                }}
              >
                {resolvedTheme === "light" ? <Moon /> : <Sun />}
                {resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onOpenChange(false);
                  const form = document.createElement("form");
                  form.method = "post";
                  form.action = "/api/auth/logout";
                  document.body.appendChild(form);
                  form.submit();
                }}
              >
                <LogOut /> Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
