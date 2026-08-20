"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Margines, jaki panel zachowuje względem krawędzi okna. */
const VIEWPORT_MARGIN = 8;

/**
 * Prosty popover zakotwiczony przy elemencie wyzwalającym.
 * Zamyka się kliknięciem poza obszarem i klawiszem Escape.
 *
 * Panel jest po otwarciu mierzony i — jeśli wychodziłby poza okno — przesuwany
 * poziomo tak, by w całości mieścił się na ekranie. Bez tego filtry stojące przy
 * prawej krawędzi paska (np. zakresy dat) rozlewały się poza układ strony.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  className,
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setOffset(0);
      return;
    }

    const clamp = () => {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return;

      // Liczymy z geometrii układu (offsetWidth), a nie z getBoundingClientRect
      // panelu — ten drugi jest w trakcie animacji otwarcia przeskalowany.
      const anchor = container.getBoundingClientRect();
      const width = panel.offsetWidth;
      const left = align === "end" ? anchor.right - width : anchor.left;

      const overflowRight = left + width - (window.innerWidth - VIEWPORT_MARGIN);
      const overflowLeft = VIEWPORT_MARGIN - left;

      if (overflowLeft > 0) setOffset(overflowLeft);
      else if (overflowRight > 0) setOffset(-overflowRight);
      else setOffset(0);
    };

    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [open, align]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((value) => !value), id })}
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          style={offset ? { translate: `${offset}px` } : undefined}
          className={cn(
            "animate-pop-in absolute z-40 mt-1.5 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}
