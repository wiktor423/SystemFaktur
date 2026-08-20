"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

/**
 * Stronicowanie po stronie klienta. Docelowo te same parametry (limit, offset)
 * trafią do zapytania do bazy — dlatego lista nie renderuje wszystkich wierszy
 * naraz nawet teraz.
 */
export function TableFooter({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedCount = 0,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  selectedCount?: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-2.5">
      <div className="flex items-center gap-3 text-[12.5px] text-fg-muted">
        <span className="tnum">
          {from}–{to} z {total}
        </span>
        {selectedCount > 0 ? (
          <span className="tnum rounded-md bg-accent-soft px-1.5 py-0.5 text-accent">
            zaznaczono {selectedCount}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          Na stronie
          <Select
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-7 w-18 text-[12.5px]"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
          </Select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Poprzednia strona"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="tnum px-1 text-[12.5px] text-fg-muted">
            {page + 1} / {pageCount}
          </span>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Następna strona"
            disabled={page + 1 >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
