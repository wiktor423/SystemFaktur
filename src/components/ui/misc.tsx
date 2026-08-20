"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Kontener treści z ramką — podstawowy „papier” aplikacji. */
export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-border bg-surface shadow-panel",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-fg-subtle">
        <Icon className="size-5" />
      </div>
      <div className="max-w-sm">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Para etykieta / wartość — używana w podglądzie dokumentu i kartotekach. */
export function DataRow({
  label,
  children,
  className,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 py-2", className)}>
      <dt className="text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className={cn("text-[13.5px] text-fg", mono && "tnum font-mono text-[12.5px]")}>{children}</dd>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active
                ? "bg-surface text-fg shadow-panel"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "tnum rounded px-1 text-[11px]",
                  active ? "bg-accent-soft text-accent" : "bg-surface-3 text-fg-subtle",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Pasek postępu / udziału — używany w podsumowaniach kategorii. */
export function Meter({ value, tone = "accent" }: { value: number; tone?: "accent" | "success" | "danger" }) {
  const tones = {
    accent: "bg-accent",
    success: "bg-success",
    danger: "bg-danger",
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full transition-[width]", tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
