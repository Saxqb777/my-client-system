"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function carriesFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Files dragged anywhere over the window. Returns true while a file is held over the page, for the overlay.
 * Text or links dragged inside the page are left alone.
 */
export function useWindowFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);

  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!enabled) return;
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      // Without this the browser opens the file in the tab instead of handing it to Orbit.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) handler.current(files);
    };
    const reset = () => {
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [enabled]);

  return enabled && dragging;
}

/** The paper sheet shown while a file is held over the page. It takes no clicks; the window listener does the work. */
export function DropOverlay({ show, title, hint }: { show: boolean; title: string; hint: string }) {
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-4 sm:p-8" aria-live="polite">
      <div className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-border-strong text-center">
        <p className="font-display text-[26px] leading-tight text-text">{title}</p>
        <p className="max-w-[420px] px-4 text-[13px] text-muted">{hint}</p>
      </div>
    </div>,
    document.body,
  );
}
