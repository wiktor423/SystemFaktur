"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import type { RegisterStats } from "@/lib/data/queries";

/** Cztery liczby, od których zaczyna się dzień w księgowości. */
export function RegisterStatsRow({
  stats,
  onShowOverdue,
}: {
  stats: RegisterStats;
  onShowOverdue?: () => void;
}) {
  return (
    <div className="grid gap-2.5 border-b border-border bg-surface px-6 py-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={ArrowUpRight}
        tone="warning"
        label="Zobowiązania do zapłaty"
        value={formatAmount(stats.payableOpen)}
        detail={
          stats.payableOverdue > 0
            ? `w tym ${formatAmount(stats.payableOverdue)} po terminie`
            : "wszystko w terminie"
        }
        alert={stats.payableOverdue > 0}
      />
      <StatCard
        icon={ArrowDownLeft}
        tone="success"
        label="Należności do otrzymania"
        value={formatAmount(stats.receivableOpen)}
        detail={
          stats.receivableOverdue > 0
            ? `w tym ${formatAmount(stats.receivableOverdue)} po terminie`
            : "wszystko w terminie"
        }
        alert={stats.receivableOverdue > 0}
      />
      <StatCard
        icon={AlertTriangle}
        tone="danger"
        label="Dokumenty po terminie"
        value={String(stats.overdueCount)}
        detail={stats.overdueCount > 0 ? "kliknij, aby przefiltrować" : "brak zaległości"}
        onClick={stats.overdueCount > 0 ? onShowOverdue : undefined}
      />
      <StatCard
        icon={CalendarClock}
        tone="info"
        label="Termin w ciągu 7 dni"
        value={String(stats.dueThisWeekCount)}
        detail={`${stats.documentCount} dokumentów w widoku`}
      />
    </div>
  );
}

const tones = {
  warning: "text-warning bg-warning-soft border-warning-border",
  success: "text-success bg-success-soft border-success-border",
  danger: "text-danger bg-danger-soft border-danger-border",
  info: "text-info bg-info-soft border-info-border",
} as const;

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  detail,
  alert = false,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof tones;
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  const Element = onClick ? "button" : "div";

  return (
    <Element
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left transition-colors",
        onClick && "cursor-pointer hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", tones[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</div>
        <div className="tnum truncate text-[16px] font-semibold tracking-[-0.01em] text-fg">{value}</div>
        <div className={cn("truncate text-[11.5px]", alert ? "text-danger" : "text-fg-subtle")}>{detail}</div>
      </div>
    </Element>
  );
}
