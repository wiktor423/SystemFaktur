"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/popover";
import { Input } from "@/components/ui/field";
import { formatDate } from "@/lib/format";

export interface DateRange {
  from: string | null;
  to: string | null;
}

function isoOffset(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Gotowe zakresy — najczęstsze pytania księgowości o dokumenty. */
function presets(): Array<{ label: string; range: DateRange }> {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfPreviousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const last30 = new Date(today);
  last30.setDate(last30.getDate() - 30);

  return [
    { label: "Ostatnie 30 dni", range: { from: isoOffset(last30), to: isoOffset(today) } },
    { label: "Bieżący miesiąc", range: { from: isoOffset(startOfMonth), to: isoOffset(today) } },
    { label: "Poprzedni miesiąc", range: { from: isoOffset(startOfPreviousMonth), to: isoOffset(endOfPreviousMonth) } },
    { label: "Bieżący kwartał", range: { from: isoOffset(startOfQuarter), to: isoOffset(today) } },
  ];
}

export function DateRangeFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const active = Boolean(value.from || value.to);
  const summary = active
    ? `${value.from ? formatDate(value.from) : "…"} – ${value.to ? formatDate(value.to) : "…"}`
    : label;

  return (
    <Popover
      panelClassName="w-80 p-3"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
            active
              ? "border-accent-border bg-accent-soft text-accent"
              : "border-border-strong bg-surface text-fg-muted hover:border-fg-subtle hover:text-fg",
          )}
        >
          <CalendarRange className="size-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col gap-3">
          <div className="text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</div>

          {/* `min-w-0` jest konieczne: natywne pole `type="date"` ma własną
              szerokość minimalną i bez tego wystaje poza panel filtra. */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={`${label} — od`}
              value={value.from ?? ""}
              max={value.to ?? undefined}
              onChange={(event) => onChange({ ...value, from: event.target.value || null })}
              className="h-8 min-w-0 flex-1 px-2 text-[13px]"
            />
            <span className="shrink-0 text-fg-subtle">–</span>
            <Input
              type="date"
              aria-label={`${label} — do`}
              value={value.to ?? ""}
              min={value.from ?? undefined}
              onChange={(event) => onChange({ ...value, to: event.target.value || null })}
              className="h-8 min-w-0 flex-1 px-2 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-1">
            {presets().map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onChange(preset.range);
                  close();
                }}
                className="rounded-lg border border-border px-2 py-1.5 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-fg"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {active ? (
            <button
              type="button"
              onClick={() => {
                onChange({ from: null, to: null });
                close();
              }}
              className="rounded-lg py-1.5 text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Wyczyść zakres
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
