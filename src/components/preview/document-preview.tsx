"use client";

import { useMemo, useState } from "react";
import { FileQuestion, Pencil } from "lucide-react";
import type { InvoiceDocument } from "@/lib/domain/types";
import { useAppData } from "@/lib/data/store";
import { categoryPath } from "@/lib/data/queries";
import { formatAmount, formatBankAccount, formatDate, formatDateTime, formatNip } from "@/lib/format";
import { documentDedupKey } from "@/lib/domain/validation";
import { SegmentedControl, DataRow, EmptyState } from "@/components/ui/misc";
import { PdfViewer } from "@/components/preview/pdf-viewer";
import { KsefInvoiceView } from "@/components/preview/ksef-invoice-view";
import { PaymentStatusBadge, SourceBadge, TypeBadge } from "@/components/documents/document-badges";

type PreviewTab = "preview" | "data" | "history";

/**
 * Spójny podgląd dokumentu niezależnie od źródła:
 * – PDF renderowany w przeglądarce,
 * – XML KSeF w formie czytelnej faktury,
 * – dokument ręczny prezentowany w tym samym układzie, tylko z danych formularza.
 */
export function DocumentPreview({
  document,
  onEdit,
}: {
  document: InvoiceDocument;
  onEdit?: (document: InvoiceDocument) => void;
}) {
  const { state } = useAppData();
  const [tab, setTab] = useState<PreviewTab>("preview");

  const counterparty = state.counterparties.find((item) => item.id === document.counterpartyId);
  const type = state.documentTypes.find((item) => item.id === document.typeId);
  const direction = type?.direction === "receivable" ? "sale" : "purchase";

  const structuredAvailable = document.lines.length > 0;
  const pdfAvailable = document.attachment?.kind === "pdf";

  const dedupKey = useMemo(
    () => documentDedupKey(document.number, counterparty?.nip ?? ""),
    [document.number, counterparty?.nip],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "preview", label: "Podgląd" },
            { value: "data", label: "Dane" },
            { value: "history", label: "Pochodzenie" },
          ]}
        />
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={document.paymentStatus} dueDate={document.dueDate} />
          <SourceBadge source={document.source} />
        </div>
      </div>

      {tab === "preview" ? (
        <div className="min-h-0 flex-1">
          {pdfAvailable ? (
            <PdfViewer
              url={document.attachment!.url}
              filename={document.attachment!.filename}
              size={document.attachment!.size}
            />
          ) : structuredAvailable ? (
            <KsefInvoiceView document={document} counterparty={counterparty} direction={direction} />
          ) : (
            <EmptyState
              icon={FileQuestion}
              title="Dokument bez pliku źródłowego"
              description="Ten dokument wprowadzono ręcznie. Wszystkie dane pochodzą z formularza — otwórz zakładkę „Dane”, aby je zobaczyć."
              action={
                onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(document)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edytuj dokument
                  </button>
                ) : null
              }
            />
          )}
        </div>
      ) : null}

      {tab === "data" ? (
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <dl className="grid grid-cols-2 gap-x-5 divide-y divide-border sm:grid-cols-3">
            <DataRow label="Numer dokumentu">{document.number}</DataRow>
            <DataRow label="Typ">
              <TypeBadge type={type} />
            </DataRow>
            <DataRow label="Status">
              <PaymentStatusBadge status={document.paymentStatus} dueDate={document.dueDate} />
            </DataRow>

            <DataRow label="Kontrahent" className="col-span-2 sm:col-span-2">
              {counterparty?.name ?? "—"}
            </DataRow>
            <DataRow label="NIP" mono>
              {counterparty ? formatNip(counterparty.nip) : "—"}
            </DataRow>

            <DataRow label="Adres" className="col-span-2 sm:col-span-3">
              {counterparty
                ? `${counterparty.address.street}, ${counterparty.address.postalCode} ${counterparty.address.city}${
                    counterparty.address.country !== "PL" ? `, ${counterparty.address.country}` : ""
                  }`
                : "—"}
            </DataRow>

            <DataRow label="Data wystawienia">{formatDate(document.issueDate)}</DataRow>
            <DataRow label="Data sprzedaży">{formatDate(document.saleDate)}</DataRow>
            <DataRow label="Termin płatności">{formatDate(document.dueDate)}</DataRow>

            <DataRow label="Netto">{formatAmount(document.netAmount, document.currency)}</DataRow>
            <DataRow label="VAT">{formatAmount(document.vatAmount, document.currency)}</DataRow>
            <DataRow label="Brutto">
              <span className="font-medium">{formatAmount(document.grossAmount, document.currency)}</span>
            </DataRow>

            <DataRow label="Rachunek do zapłaty" className="col-span-2 sm:col-span-3" mono>
              {formatBankAccount(document.paymentAccount)}
            </DataRow>

            <DataRow label="Kategoria" className="col-span-2">
              {categoryPath(state.categories, document.categoryId)}
              {document.categoryAutoAssigned ? (
                <span className="ml-1.5 rounded bg-surface-3 px-1 text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase">
                  auto
                </span>
              ) : null}
            </DataRow>
            <DataRow label="Etap">{document.stage === "buffer" ? "Bufor" : "Rejestr"}</DataRow>

            {document.notes ? (
              <DataRow label="Uwagi" className="col-span-2 sm:col-span-3">
                {document.notes}
              </DataRow>
            ) : null}
          </dl>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <dl className="grid grid-cols-2 gap-x-5 divide-y divide-border">
            <DataRow label="Źródło">
              <SourceBadge source={document.source} />
            </DataRow>
            <DataRow label="Numer KSeF" mono>
              {document.ksefNumber ?? "—"}
            </DataRow>
            <DataRow label="Wpłynął do systemu">{formatDateTime(document.receivedAt)}</DataRow>
            <DataRow label="Przeniesiony do rejestru">{formatDateTime(document.registeredAt)}</DataRow>
            <DataRow label="Załącznik" className="col-span-2">
              {document.attachment
                ? `${document.attachment.filename} (${document.attachment.kind.toUpperCase()})`
                : "Brak pliku źródłowego"}
            </DataRow>
            <DataRow label="Klucz deduplikacji" className="col-span-2" mono>
              {dedupKey}
            </DataRow>
          </dl>

          <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
            Klucz deduplikacji (numer dokumentu + NIP kontrahenta) blokuje ponowne dodanie tej samej faktury —
            niezależnie od tego, czy trafia z KSeF, z uploadu, czy z formularza. Dla dokumentów z KSeF
            dodatkowo obowiązuje unikalność numeru KSeF.
          </p>
        </div>
      ) : null}
    </div>
  );
}
