"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, MoreHorizontal, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import { COLUMN_DEFINITIONS } from "@/lib/data/columns";
import type {
  Category,
  Counterparty,
  DocumentColumnKey,
  DocumentType,
  InvoiceDocument,
  SortState,
} from "@/lib/domain/types";
import { formatAmount, formatBankAccount, formatDate, formatNip } from "@/lib/format";
import { Checkbox } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  CategoryTag,
  DueDateCell,
  PaymentStatusBadge,
  SourceBadge,
  TypeBadge,
} from "@/components/documents/document-badges";

export interface RowAction {
  label: string;
  icon: ReactNode;
  onSelect: (document: InvoiceDocument) => void;
  tone?: "default" | "danger";
}

export interface DocumentsTableProps {
  documents: InvoiceDocument[];
  columnKeys: DocumentColumnKey[];
  counterpartiesById: Map<string, Counterparty>;
  categoriesById: Map<string, Category>;
  typesById: Map<string, DocumentType>;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (document: InvoiceDocument) => void;
  activeDocumentId?: string | null;
  rowActions?: RowAction[];
  emptyState: ReactNode;
}

export function DocumentsTable({
  documents,
  columnKeys,
  counterpartiesById,
  categoriesById,
  typesById,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  onRowClick,
  activeDocumentId,
  rowActions,
  emptyState,
}: DocumentsTableProps) {
  const selectable = Boolean(selectedIds && onSelectionChange);
  const allSelected = selectable && documents.length > 0 && documents.every((document) => selectedIds!.has(document.id));
  const someSelected = selectable && documents.some((document) => selectedIds!.has(document.id));

  const toggleAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    documents.forEach((document) => (checked ? next.add(document.id) : next.delete(document.id)));
    onSelectionChange(next);
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const changeSort = (key: DocumentColumnKey) => {
    if (!COLUMN_DEFINITIONS[key].sortable) return;
    onSortChange(
      sort.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "issueDate" || key === "dueDate" ? "desc" : "asc" },
    );
  };

  if (documents.length === 0) {
    return <div className="flex-1">{emptyState}</div>;
  }

  return (
    <div className="scroll-slim flex-1 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10">
          <tr>
            {selectable ? (
              <th scope="col" className="w-10 border-b border-border bg-surface-2 px-3 py-2">
                <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
            ) : null}

            {columnKeys.map((key) => {
              const definition = COLUMN_DEFINITIONS[key];
              const active = sort.key === key;
              const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

              return (
                <th
                  key={key}
                  scope="col"
                  style={{ width: definition.width }}
                  className={cn(
                    "border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase",
                    definition.align === "right" && "text-right",
                  )}
                >
                  {definition.sortable ? (
                    <button
                      type="button"
                      onClick={() => changeSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-fg",
                        definition.align === "right" && "flex-row-reverse",
                        active && "text-accent",
                      )}
                    >
                      {definition.label}
                      <Icon className={cn("size-3", active ? "opacity-100" : "opacity-35")} aria-hidden />
                    </button>
                  ) : (
                    definition.label
                  )}
                </th>
              );
            })}

            {rowActions?.length ? <th scope="col" className="w-10 border-b border-border bg-surface-2" /> : null}
          </tr>
        </thead>

        <tbody>
          {documents.map((document) => {
            const selected = selectable && selectedIds!.has(document.id);
            const active = activeDocumentId === document.id;

            return (
              <tr
                key={document.id}
                onClick={() => onRowClick?.(document)}
                className={cn(
                  "group transition-colors",
                  onRowClick && "cursor-pointer",
                  active ? "bg-accent-soft/60" : selected ? "bg-accent-soft/35" : "hover:bg-surface-2/70",
                )}
              >
                {selectable ? (
                  <td className="border-b border-border px-3 py-2 align-middle" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected} onChange={(checked) => toggleRow(document.id, checked)} />
                  </td>
                ) : null}

                {columnKeys.map((key) => (
                  <td
                    key={key}
                    className={cn(
                      "border-b border-border px-3 py-2 align-middle text-[13px] text-fg",
                      COLUMN_DEFINITIONS[key].align === "right" && "text-right",
                    )}
                  >
                    <Cell
                      column={key}
                      document={document}
                      counterparty={counterpartiesById.get(document.counterpartyId)}
                      category={document.categoryId ? categoriesById.get(document.categoryId) : undefined}
                      categoriesById={categoriesById}
                      type={typesById.get(document.typeId)}
                    />
                  </td>
                ))}

                {rowActions?.length ? (
                  <td className="border-b border-border px-1 py-2 align-middle" onClick={(event) => event.stopPropagation()}>
                    <Popover
                      align="end"
                      panelClassName="w-52"
                      trigger={({ toggle }) => (
                        <button
                          type="button"
                          onClick={toggle}
                          aria-label={`Akcje dla dokumentu ${document.number}`}
                          className="rounded-md p-1.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-fg focus-visible:opacity-100"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </button>
                      )}
                    >
                      {({ close }) => (
                        <div className="flex flex-col">
                          {rowActions.map((action) => (
                            <button
                              key={action.label}
                              type="button"
                              onClick={() => {
                                action.onSelect(document);
                                close();
                              }}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                                action.tone === "danger" ? "text-danger" : "text-fg",
                              )}
                            >
                              {action.icon}
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Popover>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  column,
  document,
  counterparty,
  category,
  categoriesById,
  type,
}: {
  column: DocumentColumnKey;
  document: InvoiceDocument;
  counterparty: Counterparty | undefined;
  category: Category | undefined;
  categoriesById: Map<string, Category>;
  type: DocumentType | undefined;
}) {
  switch (column) {
    case "number":
      return (
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-fg">{document.number}</span>
          {document.attachment ? (
            <span
              title={`Załącznik: ${document.attachment.filename}`}
              className="shrink-0 text-fg-subtle"
            >
              {document.attachment.kind === "pdf" ? (
                <Paperclip className="size-3.5" aria-hidden />
              ) : (
                <FileText className="size-3.5" aria-hidden />
              )}
            </span>
          ) : null}
        </div>
      );

    case "type":
      return <TypeBadge type={type} />;

    case "counterparty":
      return (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] text-fg">{counterparty?.name ?? "—"}</span>
          <span className="tnum truncate text-[11.5px] text-fg-subtle">
            {counterparty ? formatNip(counterparty.nip) : ""}
          </span>
        </div>
      );

    case "nip":
      return <span className="tnum">{counterparty ? formatNip(counterparty.nip) : "—"}</span>;

    case "issueDate":
      return <span className="tnum">{formatDate(document.issueDate)}</span>;

    case "dueDate":
      return <DueDateCell dueDate={document.dueDate} paid={document.paymentStatus === "paid"} />;

    case "netAmount":
      return <span className="tnum">{formatAmount(document.netAmount, document.currency)}</span>;

    case "vatAmount":
      return <span className="tnum text-fg-muted">{formatAmount(document.vatAmount, document.currency)}</span>;

    case "grossAmount":
      return (
        <span className="tnum font-medium">{formatAmount(document.grossAmount, document.currency)}</span>
      );

    case "category":
      return category ? (
        <CategoryTag
          name={category.name}
          color={resolveCategoryColor(category, categoriesById)}
          auto={document.categoryAutoAssigned}
        />
      ) : (
        <span className="text-fg-subtle">Bez kategorii</span>
      );

    case "source":
      return <SourceBadge source={document.source} />;

    case "paymentStatus":
      return <PaymentStatusBadge status={document.paymentStatus} dueDate={document.dueDate} />;

    case "paymentAccount":
      return (
        <span className="tnum font-mono text-[12px] text-fg-muted">
          {formatBankAccount(document.paymentAccount)}
        </span>
      );

    case "ksefNumber":
      return document.ksefNumber ? (
        <span className="tnum font-mono text-[12px] text-fg-muted">{document.ksefNumber}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      );

    default:
      return <Fragment />;
  }
}

/** Kolor znacznika dziedziczony po kategorii nadrzędnej. */
export function resolveCategoryColor(category: Category, categoriesById: Map<string, Category>): string | null {
  let current: Category | undefined = category;
  let guard = 0;
  while (current && guard < 16) {
    if (current.color) return current.color;
    current = current.parentId ? categoriesById.get(current.parentId) : undefined;
    guard += 1;
  }
  return null;
}
