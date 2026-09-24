"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NavClient } from "@/components/shell/nav";
import { QuickLogDialog } from "./QuickLogDialog";
import { CommandPalette } from "./CommandPalette";

type QuickLogContext = {
  clients: NavClient[];
  open: (text?: string, opts?: { autoParse?: boolean }) => void;
  openPalette: () => void;
};

const Ctx = createContext<QuickLogContext | null>(null);

export function useQuickLog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuickLog must be used inside QuickLogProvider");
  return ctx;
}

export function QuickLogProvider({ clients, children }: { clients: NavClient[]; children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; autoParse: boolean; nonce: number }>({ text: "", autoParse: false, nonce: 0 });
  const [paletteOpen, setPaletteOpen] = useState(false);

  const open = useCallback((text = "", opts?: { autoParse?: boolean }) => {
    setSeed({ text, autoParse: Boolean(opts?.autoParse && text.trim().length > 1), nonce: Date.now() });
    setPaletteOpen(false);
    setDialogOpen(true);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ clients, open, openPalette }), [clients, open, openPalette]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <QuickLogDialog open={dialogOpen} onOpenChange={setDialogOpen} seed={seed} clients={clients} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} clients={clients} onLog={(t) => open(t, { autoParse: true })} />
    </Ctx.Provider>
  );
}
