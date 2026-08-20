"use client";

import { useMemo, useState } from "react";
import { Eye, FileText, Pencil, Plus, SearchX, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/documents/filter-bar";
import { ColumnSettings } from "@/components/documents/column-settings";
import { DocumentsTable } from "@/components/documents/documents-table";
import { RegisterStatsRow } from "@/components/documents/register-stats";
import { TableFooter } from "@/components/documents/table-footer";
import { DocumentFormModal } from "@/components/documents/document-form";
import { DocumentPreview } from "@/components/preview/document-preview";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAppData, useDocumentQuery } from "@/lib/data/store";
import { buildLookups, countActiveFilters, emptyFilters } from "@/lib/data/queries";
import type { DocumentFilters, InvoiceDocument, SortState } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";

/**
 * Rejestr dokumentów — centralny widok modułu.
 *
 * Strona odpowiada wyłącznie za stan interfejsu: filtry, sortowanie,
 * zaznaczenie i otwarte panele. Samo wyszukiwanie wykonuje baza — strona
 * przekazuje kryteria do `useDocumentQuery` i dostaje gotową stronę wyników
 * wraz z podsumowaniem liczonym dla całego dopasowania, nie dla widoku.
 */
export default function RegisterPage() {
  const { state, deleteDocuments, setColumns } = useAppData();
  const toast = useToast();

  const [filters, setFilters] = useState<DocumentFilters>(emptyFilters);
  const [sort, setSort] = useState<SortState>({ key: "issueDate", direction: "desc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [previewDocument, setPreviewDocument] = useState<InvoiceDocument | null>(null);
  const [editedDocument, setEditedDocument] = useState<InvoiceDocument | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const lookups = useMemo(
    () => buildLookups(state.counterparties, state.categories, state.documentTypes),
    [state.counterparties, state.categories, state.documentTypes],
  );

  const { documents: paged, total, stats, loading } = useDocumentQuery({
    filters,
    sort,
    page: page + 1,
    pageSize,
    stage: "registered",
  });

  const visibleColumnKeys = useMemo(
    () => state.columns.filter((column) => column.visible).map((column) => column.key),
    [state.columns],
  );

  // Zmiana filtrów zawsze wraca na pierwszą stronę — inaczej widok potrafi
  // „zniknąć” użytkownikowi przy zawężeniu wyników.
  const changeFilters = (next: DocumentFilters) => {
    setFilters(next);
    setPage(0);
  };

  // Podglad trzyma wlasna kopie dokumentu, wiec po odswiezeniu listy
  // bierzemy swiezsza wersje, jesli wciaz jest w wyniku.
  const currentPreview = previewDocument
    ? (paged.find((document) => document.id === previewDocument.id) ?? previewDocument)
    : null;

  const removeSelected = async () => {
    const ids = [...selectedIds];
    const result = await deleteDocuments(ids);
    setSelectedIds(new Set());
    if (currentPreview && ids.includes(currentPreview.id)) setPreviewDocument(null);
    if (result.ok) toast.success(result.message);
    else toast.error("Nie usunięto dokumentów", result.message);
  };

  return (
    <>
      <PageHeader
        title="Rejestr dokumentów"
        description="Faktury kosztowe i sprzedażowe zaakceptowane do ewidencji."
        actions={
          <>
            {selectedIds.size > 0 ? (
              <Button variant="secondary" onClick={removeSelected}>
                <Trash2 className="size-4" aria-hidden />
                Usuń zaznaczone ({selectedIds.size})
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => {
                setEditedDocument(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Nowy dokument
            </Button>
          </>
        }
      />

      <RegisterStatsRow
        stats={stats}
        onShowOverdue={() =>
          changeFilters({
            ...emptyFilters,
            paymentStatuses: ["unpaid", "partial"],
            dueDateTo: formatIsoYesterday(),
          })
        }
      />

      <FilterBar
        filters={filters}
        onChange={changeFilters}
        trailing={<ColumnSettings columns={state.columns} onChange={setColumns} />}
      />

      {/* Wynik przychodzi z serwera, więc przy zmianie filtrów tabela na moment
          przygasa zamiast migać pustą listą. Opakowanie musi być pełnoprawną
          kolumną flex (`min-h-0 flex-1 flex-col`) — tabela w środku ma
          `flex-1 overflow-auto` i bez tego nie przejmie wysokości ani nie
          dostanie paska przewijania. */}
      <div
        aria-busy={loading}
        className={`flex min-h-0 flex-1 flex-col transition-opacity ${loading ? "opacity-60" : ""}`}
      >
      <DocumentsTable
        documents={paged}
        columnKeys={visibleColumnKeys}
        counterpartiesById={lookups.counterpartiesById}
        categoriesById={lookups.categoriesById}
        typesById={lookups.typesById}
        sort={sort}
        onSortChange={setSort}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={setPreviewDocument}
        activeDocumentId={currentPreview?.id ?? null}
        rowActions={[
          { label: "Podgląd dokumentu", icon: <Eye className="size-3.5" aria-hidden />, onSelect: setPreviewDocument },
          {
            label: "Edytuj",
            icon: <Pencil className="size-3.5" aria-hidden />,
            onSelect: (document) => {
              setEditedDocument(document);
              setFormOpen(true);
            },
          },
          {
            label: "Usuń dokument",
            icon: <Trash2 className="size-3.5" aria-hidden />,
            tone: "danger",
            onSelect: async (document) => {
              const result = await deleteDocuments([document.id]);
              if (currentPreview?.id === document.id) setPreviewDocument(null);
              if (result.ok) toast.success(`Usunięto dokument ${document.number}.`);
              else toast.error("Nie usunięto dokumentu", result.message);
            },
          },
        ]}
        emptyState={
          countActiveFilters(filters) === 0 ? (
            <EmptyState
              icon={FileText}
              title="Rejestr jest pusty"
              description="Zaakceptuj dokumenty z bufora albo dodaj pierwszą fakturę ręcznie."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditedDocument(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Nowy dokument
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Brak dokumentów spełniających filtry"
              description="Zmień kryteria albo wyczyść filtry, aby zobaczyć pełny rejestr."
              action={
                <Button variant="secondary" onClick={() => changeFilters(emptyFilters)}>
                  Wyczyść filtry
                </Button>
              }
            />
          )
        }
      />

      <TableFooter
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        selectedCount={selectedIds.size}
      />
      </div>

      <Drawer
        open={Boolean(currentPreview)}
        onClose={() => setPreviewDocument(null)}
        title={currentPreview?.number ?? ""}
        subtitle={
          currentPreview
            ? `${lookups.counterpartiesById.get(currentPreview.counterpartyId)?.name ?? "—"} · wystawiono ${formatDate(currentPreview.issueDate)}`
            : undefined
        }
        actions={
          currentPreview ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditedDocument(currentPreview);
                setFormOpen(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden />
              Edytuj
            </Button>
          ) : null
        }
      >
        {currentPreview ? (
          <DocumentPreview
            document={currentPreview}
            onEdit={(document) => {
              setEditedDocument(document);
              setFormOpen(true);
            }}
          />
        ) : null}
      </Drawer>

      <DocumentFormModal open={formOpen} onClose={() => setFormOpen(false)} document={editedDocument} />
    </>
  );
}

function formatIsoYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
