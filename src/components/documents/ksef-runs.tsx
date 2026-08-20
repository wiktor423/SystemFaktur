"use client";

import { CheckCircle2, CircleAlert, Clock, TriangleAlert } from "lucide-react";
import type { KsefRun, KsefSchedule } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { describeDateRange } from "@/lib/data/queries";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

const statusMeta = {
  success: { icon: CheckCircle2, className: "text-success", label: "Zakończone" },
  partial: { icon: CircleAlert, className: "text-warning", label: "Częściowe" },
  error: { icon: TriangleAlert, className: "text-danger", label: "Błąd" },
} as const;

const scopeLabels = {
  both: "wszystkie",
  purchase: "kosztowe",
  sale: "sprzedażowe",
} as const;

/** Historia pobrań — podstawa diagnostyki błędów integracji. */
export function KsefRunsList({ runs }: { runs: KsefRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Brak historii pobrań"
        description="Uruchom pobieranie ręczne albo poczekaj na najbliższe zadanie z harmonogramu."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {runs.map((run) => {
        const meta = statusMeta[run.status];
        const Icon = meta.icon;

        return (
          <li key={run.id} className="flex items-start gap-3 px-4 py-3">
            <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium text-fg">{formatDateTime(run.startedAt)}</span>
                <span className="text-[12px] text-fg-subtle">
                  {run.trigger === "manual" ? "ręczne" : "harmonogram"} · faktury {scopeLabels[run.scope]} ·{" "}
                  {describeDateRange(run.dateFrom, run.dateTo)}
                </span>
              </div>

              {run.status === "error" ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-danger">{run.message}</p>
              ) : (
                <p className="tnum mt-1 text-[12.5px] text-fg-muted">
                  pobrano {run.fetched} · do bufora {run.imported}
                  {run.duplicates > 0 ? ` · duplikaty ${run.duplicates}` : ""}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Najbliższe uruchomienie harmonogramu — liczone z listy godzin. */
export function nextScheduledRun(schedule: KsefSchedule, now = new Date()): Date | null {
  if (!schedule.enabled || schedule.times.length === 0) return null;

  const candidates = schedule.times
    .map((time) => {
      const [hour, minute] = time.split(":").map(Number);
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
      return date;
    })
    .sort((left, right) => left.getTime() - right.getTime());

  return candidates[0] ?? null;
}
