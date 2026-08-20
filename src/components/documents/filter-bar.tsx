"use client";

import { useMemo, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { DateRangeFilter } from "@/components/documents/date-range-filter";
import { Input } from "@/components/ui/field";
import type { DocumentFilters, DocumentSource, PaymentStatus } from "@/lib/domain/types";
import { useAppData } from "@/lib/data/store";
import { buildCategoryTree, countActiveFilters, emptyFilters, flattenCategoryTree } from "@/lib/data/queries";

const sourceOptions: MultiSelectOption[] = [
  { value: "ksef", label: "KSeF" },
  { value: "upload", label: "Upload" },
  { value: "manual", label: "Ręczny" },
];

const statusOptions: MultiSelectOption[] = [
  { value: "unpaid", label: "Nieopłacona" },
  { value: "partial", label: "Częściowo opłacona" },
  { value: "paid", label: "Zapłacona" },
];

/**
 * Pasek filtrów rejestru. Sam nie filtruje danych — zmienia wyłącznie obiekt
 * `DocumentFilters`, który strona przekazuje do czystej funkcji `filterDocuments`.
 */
export function FilterBar({
  filters,
  onChange,
  trailing,
  showStatusFilter = true,
}: {
  filters: DocumentFilters;
  onChange: (filters: DocumentFilters) => void;
  trailing?: ReactNode;
  showStatusFilter?: boolean;
}) {
  const { state } = useAppData();
  const activeCount = countActiveFilters(filters);

  const typeOptions = useMemo<MultiSelectOption[]>(
    () =>
      state.documentTypes.map((type) => ({
        value: type.id,
        label: type.name,
        hint: type.direction === "receivable" ? "należność" : "zobowiązanie",
      })),
    [state.documentTypes],
  );

  const counterpartyOptions = useMemo<MultiSelectOption[]>(
    () =>
      [...state.counterparties]
        .sort((left, right) => left.name.localeCompare(right.name, "pl"))
        .map((counterparty) => ({ value: counterparty.id, label: counterparty.name })),
    [state.counterparties],
  );

  const categoryOptions = useMemo<MultiSelectOption[]>(() => {
    const tree = buildCategoryTree(state.categories, state.usage.byCategory);
    return flattenCategoryTree(tree).map((node) => ({
      value: node.id,
      label: `${"  ".repeat(node.depth)}${node.depth > 0 ? "└ " : ""}${node.name}`,
      hint: node.totalCount > 0 ? String(node.totalCount) : undefined,
    }));
  }, [state.categories, state.usage.byCategory]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-2.5">
      <div className="relative min-w-52 flex-1 sm:max-w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <Input
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Numer, kontrahent, NIP, numer KSeF…"
          aria-label="Szukaj dokumentów"
          className="h-8 pl-8 text-[13px]"
        />
        {filters.search ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: "" })}
            aria-label="Wyczyść wyszukiwanie"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <MultiSelect
        label="Typ"
        options={typeOptions}
        selected={filters.typeIds}
        onChange={(typeIds) => onChange({ ...filters, typeIds })}
        searchable={false}
      />
      <MultiSelect
        label="Kontrahent"
        options={counterpartyOptions}
        selected={filters.counterpartyIds}
        onChange={(counterpartyIds) => onChange({ ...filters, counterpartyIds })}
      />
      <MultiSelect
        label="Kategoria"
        options={categoryOptions}
        selected={filters.categoryIds}
        onChange={(categoryIds) => onChange({ ...filters, categoryIds })}
      />
      <DateRangeFilter
        label="Data wystawienia"
        value={{ from: filters.issueDateFrom, to: filters.issueDateTo }}
        onChange={(range) => onChange({ ...filters, issueDateFrom: range.from, issueDateTo: range.to })}
      />
      <DateRangeFilter
        label="Termin płatności"
        value={{ from: filters.dueDateFrom, to: filters.dueDateTo }}
        onChange={(range) => onChange({ ...filters, dueDateFrom: range.from, dueDateTo: range.to })}
      />
      <MultiSelect
        label="Źródło"
        options={sourceOptions}
        selected={filters.sources}
        onChange={(sources) => onChange({ ...filters, sources: sources as DocumentSource[] })}
        searchable={false}
      />
      {showStatusFilter ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={filters.paymentStatuses}
          onChange={(paymentStatuses) => onChange({ ...filters, paymentStatuses: paymentStatuses as PaymentStatus[] })}
          searchable={false}
        />
      ) : null}

      {activeCount > 0 ? (
        <button
          type="button"
          onClick={() => onChange(emptyFilters)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-3.5" aria-hidden />
          Wyczyść ({activeCount})
        </button>
      ) : null}

      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
