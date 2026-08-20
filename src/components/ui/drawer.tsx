"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Panel boczny — szybki podgląd dokumentu bez opuszczania listy. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  // Tytuł bywa złożonym elementem, więc dialog etykietujemy przez
  // powiązanie z nagłówkiem, a nie tekstem w `aria-label`.
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Zamknij podgląd"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-black/25 dark:bg-black/55"
      />
      {/* Panel przykrywa treść i przechwytuje uwagę, więc dla czytnika ekranu
          musi być dialogiem — inaczej użytkownik nie wie, że wszedł w warstwę. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-slide-in-right absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-drawer",
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <div id={titleId} className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">
              {title}
            </div>
            {subtitle ? <div className="mt-0.5 truncate text-[13px] text-fg-muted">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij panel"
              className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>
        <div className="scroll-slim flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
