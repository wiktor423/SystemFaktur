"use client";

import { useMemo, useState } from "react";
import { Check, CloudDownload, Eye, History, Inbox, SearchX, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/documents/filter-bar";
import { DocumentsTable } from "@/components/documents/documents-table";
import { TableFooter } from "@/components/documents/table-footer";
import { DocumentPreview } from "@/components/preview/document-preview";
import { DocumentFormModal } from "@/components/documents/document-form";
import { KsefImportModal } from "@/components/documents/ksef-import-modal";
import { UploadModal } from "@/components/documents/upload-modal";
import { KsefRunsList, nextScheduledRun } from "@/components/documents/ksef-runs";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAppData } from "@/lib/data/store";
import { buildLookups, emptyFilters, filterDocuments, sortDocuments } from "@/lib/data/queries";
import { BUFFER_COLUMNS } from "@/lib/data/columns";
import type { Attachment, DocumentFilters, InvoiceDocument, SortState } from "@/lib/domain/types";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * Bufor (poczekalnia) — pierwszy etap obiegu dokumentu.
 *
 * Wszystko, co wpływa do systemu automatycznie (KSeF) lub przez upload, ląduje
 * tutaj. Dopiero akceptacja przenosi dokument do rejestru; odrzucenie usuwa go
 * z bufora, nie zostawiając śladu w ewidencji.
 */
export default function BufferPage() {
  const { state, acceptFromBuffer, rejectFromBuffer } = useAppData();
  const toast = useToast();

  const [filters, setFilters] = useState<DocumentFilters>(emptyFilters);
  const [sort, setSort] = useState<SortState>({ key: "issueDate", direction: "desc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [previewDocument, setPreviewDocument] = useState<InvoiceDocument | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pdfAttachment, setPdfAttachment] = useState<Attachment | null>(null);
  const [pdfStage, setPdfStage] = useState<InvoiceDocument["stage"]>("buffer");

  const lookups = useMemo(
    () => buildLookups(state.counterparties, state.categories, state.documentTypes),
    [state.counterparties, state.categories, state.documentTypes],
  );

  const buffered = useMemo(
    () => state.documents.filter((document) => document.stage === "buffer"),
    [state.documents],
  );

  const filtered = useMemo(
    () => filterDocuments(buffered, filters, lookups, state.categories),
    [buffered, filters, lookups, state.categories],
  );
  const sorted = useMemo(() => sortDocuments(filtered, sort, lookups), [filtered, sort, lookups]);
  const paged = useMemo(() => sorted.slice(page * pageSize, (page + 1) * pageSize), [sorted, page, pageSize]);

  const nextRun = useMemo(() => nextScheduledRun(state.schedule), [state.schedule]);
  const currentPreview = previewDocument
    ? (state.documents.find((document) => document.id === previewDocument.id) ?? null)
    : null;

  const accept = (ids: string[]) => {
    const result = acceptFromBuffer(ids);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSelectedIds(new Set());
    if (currentPreview && ids.includes(currentPreview.id)) setPreviewDocument(null);
    toast.success(result.message, "Znajdziesz je w rejestrze dokumentów.");
  };

  const reject = (ids: string[]) => {
    const result = rejectFromBuffer(ids);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSelectedIds(new Set());
    if (currentPreview && ids.includes(currentPreview.id)) setPreviewDocument(null);
    toast.info(result.message);
  };

  return (
    <>
      <PageHeader
        title="Bufor"
        description="Dokumenty pobrane z KSeF i wgrane ręcznie — czekają na akceptację."
        actions={
          <>
            <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" aria-hidden />
              Historia pobrań
            </Button>
            <Button variant="secondary" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" aria-hidden />
              Wgraj plik
            </Button>
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <CloudDownload className="size-4" aria-hidden />
              Pobierz z KSeF
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-2.5 text-[12.5px]">
        <p className="text-fg-muted">
          <span className="font-medium text-fg">{buffered.length}</span>{" "}
          {buffered.length === 1 ? "dokument oczekuje" : "dokumentów oczekuje"} na decyzję. Akceptacja przenosi je do
          rejestru; odrzucenie usuwa z bufora.
        </p>
        <p className="flex items-center gap-1.5 text-fg-subtle">
          <span
            className={`size-1.5 rounded-full ${state.schedule.enabled ? "bg-success" : "bg-fg-subtle"}`}
            aria-hidden
          />
          {state.schedule.enabled && nextRun
            ? `Najbliższe automatyczne pobranie: ${formatDateTime(nextRun.toISOString())}`
            : "Automatyczne pobieranie wyłączone"}
        </p>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-border bg-accent-soft px-6 py-2.5">
          <span className="text-[13px] font-medium text-accent">
            Zaznaczono {selectedIds.size} {selectedIds.size === 1 ? "dokument" : "dokumentów"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => reject([...selectedIds])}>
              <Trash2 className="size-4" aria-hidden />
              Odrzuć
            </Button>
            <Button variant="primary" onClick={() => accept([...selectedIds])}>
              <Check className="size-4" aria-hidden />
              Akceptuj i przenieś do rejestru
            </Button>
          </div>
        </div>
      ) : null}

      <FilterBar filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} showStatusFilter={false} />

      <DocumentsTable
        documents={paged}
        columnKeys={BUFFER_COLUMNS}
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
            label: "Akceptuj",
            icon: <Check className="size-3.5" aria-hidden />,
            onSelect: (document) => accept([document.id]),
          },
          {
            label: "Odrzuć",
            icon: <Trash2 className="size-3.5" aria-hidden />,
            tone: "danger",
            onSelect: (document) => reject([document.id]),
          },
        ]}
        emptyState={
          buffered.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Bufor jest pusty"
              description="Wszystkie dokumenty zostały rozpatrzone. Pobierz nowe faktury z KSeF albo wgraj plik spoza systemu."
              action={
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4" aria-hidden />
                    Wgraj plik
                  </Button>
                  <Button variant="primary" onClick={() => setImportOpen(true)}>
                    <CloudDownload className="size-4" aria-hidden />
                    Pobierz z KSeF
                  </Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Brak dokumentów spełniających filtry"
              description="Zmień kryteria, aby zobaczyć pozostałe pozycje bufora."
              action={
                <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>
                  Wyczyść filtry
                </Button>
              }
            />
          )
        }
      />

      <TableFooter
        total={sorted.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        selectedCount={selectedIds.size}
      />

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
            <>
              <Button size="sm" variant="secondary" onClick={() => reject([currentPreview.id])}>
                <Trash2 className="size-3.5" aria-hidden />
                Odrzuć
              </Button>
              <Button size="sm" variant="primary" onClick={() => accept([currentPreview.id])}>
                <Check className="size-3.5" aria-hidden />
                Akceptuj
              </Button>
            </>
          ) : null
        }
      >
        {currentPreview ? <DocumentPreview document={currentPreview} /> : null}
      </Drawer>

      <KsefImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onPdfSelected={(attachment, stage) => {
          setPdfAttachment(attachment);
          setPdfStage(stage);
        }}
      />

      <DocumentFormModal
        open={Boolean(pdfAttachment)}
        onClose={() => setPdfAttachment(null)}
        document={null}
        attachment={pdfAttachment}
        defaultStage={pdfStage}
      />

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        size="lg"
        title="Historia pobrań z KSeF"
        description="Uruchomienia ręczne i automatyczne wraz z liczbą pominiętych duplikatów."
        footer={
          <Button variant="secondary" onClick={() => setHistoryOpen(false)}>
            Zamknij
          </Button>
        }
      >
        <div className="-mx-5 -my-4 max-h-[60vh] overflow-y-auto">
          <KsefRunsList runs={state.ksefRuns} />
        </div>
      </Modal>
    </>
  );
}
