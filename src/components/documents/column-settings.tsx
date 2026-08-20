"use client";

import { useState } from "react";
import { Columns3, GripVertical, RotateCcw } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/field";
import { COLUMN_DEFINITIONS, DEFAULT_COLUMNS } from "@/lib/data/columns";
import type { ColumnConfig } from "@/lib/domain/types";
import { cn } from "@/lib/cn";

/**
 * Konfiguracja kolumn rejestru: widoczność (checkbox) i kolejność
 * (przeciągnięcie wiersza). Ustawienie jest częścią stanu aplikacji, więc
 * przetrwa przeładowanie strony.
 */
export function ColumnSettings({
  columns,
  onChange,
}: {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
}) {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const visibleCount = columns.filter((column) => column.visible).length;

  const toggle = (key: string, visible: boolean) => {
    onChange(columns.map((column) => (column.key === key ? { ...column, visible } : column)));
  };

  const move = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const next = [...columns];
    const fromIndex = next.findIndex((column) => column.key === fromKey);
    const toIndex = next.findIndex((column) => column.key === toKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  return (
    <Popover
      align="end"
      panelClassName="w-72 p-0"
      trigger={({ toggle: toggleOpen, open }) => (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          title="Konfiguracja kolumn"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg"
        >
          <Columns3 className="size-3.5" aria-hidden />
          Kolumny
          <span className="tnum rounded bg-surface-3 px-1 text-[11px] text-fg-subtle">{visibleCount}</span>
        </button>
      )}
    >
      {() => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">
              Widoczność i kolejność
            </span>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_COLUMNS)}
              title="Przywróć domyślny układ"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <RotateCcw className="size-3" aria-hidden />
              Domyślne
            </button>
          </div>

          <ul className="scroll-slim max-h-80 overflow-y-auto p-1">
            {columns.map((column) => {
              const definition = COLUMN_DEFINITIONS[column.key];
              const dragging = draggedKey === column.key;

              return (
                <li
                  key={column.key}
                  draggable
                  onDragStart={() => setDraggedKey(column.key)}
                  onDragEnd={() => setDraggedKey(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedKey) move(draggedKey, column.key);
                    setDraggedKey(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors",
                    dragging ? "bg-accent-soft opacity-60" : "hover:bg-surface-2",
                  )}
                >
                  <GripVertical className="size-3.5 shrink-0 cursor-grab text-fg-subtle" aria-hidden />
                  <Checkbox
                    checked={column.visible}
                    disabled={definition.locked}
                    onChange={(checked) => toggle(column.key, checked)}
                    label={
                      <span className="flex items-center gap-1.5">
                        {definition.label}
                        {definition.locked ? (
                          <span className="text-[10.5px] tracking-wide text-fg-subtle uppercase">stała</span>
                        ) : null}
                      </span>
                    }
                    className="min-w-0 flex-1"
                  />
                </li>
              );
            })}
          </ul>

          <p className="border-t border-border px-3 py-2 text-[11.5px] leading-4 text-fg-subtle">
            Przeciągnij wiersz, aby zmienić kolejność kolumn w tabeli.
          </p>
        </div>
      )}
    </Popover>
  );
}
