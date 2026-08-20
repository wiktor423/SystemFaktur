"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastApi {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
} as const;

const tones: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-info",
};

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, detail?: string) => {
      nextToastId += 1;
      const id = nextToastId;
      setToasts((current) => [...current, { id, tone, message, detail }].slice(-4));
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, detail) => push("success", message, detail),
      error: (message, detail) => push("error", message, detail),
      info: (message, detail) => push("info", message, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = icons[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className="animate-pop-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-pop"
            >
              <Icon className={cn("mt-px size-4 shrink-0", tones[toast.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-5 font-medium text-fg">{toast.message}</p>
                {toast.detail ? <p className="mt-0.5 text-[12.5px] leading-5 text-fg-muted">{toast.detail}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Zamknij powiadomienie"
                className="rounded-md p-0.5 text-fg-subtle transition-colors hover:text-fg"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast musi być użyty wewnątrz <ToastProvider>.");
  return context;
}
