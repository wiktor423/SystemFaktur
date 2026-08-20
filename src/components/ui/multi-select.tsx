"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

/** Filtr wielokrotnego wyboru z wyszukiwarką — używany w pasku filtrów. */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = true,
  align = "start",
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? label)
        : `${label}: ${selected.length}`;

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <Popover
      align={align}
      className={className}
      panelClassName="w-72 p-0"
      trigger={({ toggle: toggleOpen, open }) => (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className={cn(
            "inline-flex h-8 max-w-56 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
            selected.length > 0
              ? "border-accent-border bg-accent-soft text-accent"
              : "border-border-strong bg-surface text-fg-muted hover:border-fg-subtle hover:text-fg",
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      )}
    >
      {() => (
        <div>
          {searchable ? (
            <div className="relative border-b border-border">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj…"
                className="h-9 w-full bg-transparent pr-3 pl-8.5 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </div>
          ) : null}

          <div className="scroll-slim max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[13px] text-fg-subtle">Brak wyników</p>
            ) : (
              filtered.map((option) => {
                const active = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
                        active ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
                      )}
                    >
                      {active ? <Check className="size-3" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint ? <span className="shrink-0 text-[11.5px] text-fg-subtle">{option.hint}</span> : null}
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 ? (
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Wyczyść zaznaczenie
              </button>
            </div>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
