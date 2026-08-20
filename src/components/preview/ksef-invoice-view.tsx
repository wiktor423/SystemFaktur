"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { Counterparty, InvoiceDocument } from "@/lib/domain/types";
import { OWN_COMPANY } from "@/lib/ksef/mock-client";
import { serializeFa2 } from "@/lib/ksef/fa2";
import type { KsefInvoice } from "@/lib/ksef/client";
import { formatAmount, formatBankAccount, formatDate, formatNip, formatQuantity } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

/** Buduje reprezentację KSeF dokumentu — na potrzeby podglądu źródłowego XML. */
export function documentToKsefInvoice(
  document: InvoiceDocument,
  counterparty: Counterparty | undefined,
  direction: "purchase" | "sale",
): KsefInvoice {
  const party = {
    nip: counterparty?.nip ?? "",
    name: counterparty?.name ?? "Nieznany kontrahent",
    street: counterparty?.address.street ?? "",
    postalCode: counterparty?.address.postalCode ?? "",
    city: counterparty?.address.city ?? "",
    country: counterparty?.address.country ?? "PL",
  };

  return {
    ksefNumber: document.ksefNumber ?? "",
    invoiceNumber: document.number,
    issueDate: document.issueDate,
    saleDate: document.saleDate,
    dueDate: document.dueDate,
    currency: document.currency,
    seller: direction === "purchase" ? party : OWN_COMPANY,
    buyer: direction === "purchase" ? OWN_COMPANY : party,
    lines: document.lines,
    netAmount: document.netAmount,
    vatAmount: document.vatAmount,
    grossAmount: document.grossAmount,
    paymentAccount: document.paymentAccount,
    direction,
    acquisitionTimestamp: document.receivedAt,
  };
}

/**
 * Czytelna prezentacja faktury ustrukturyzowanej — strony transakcji, pozycje
 * i podsumowanie stawek VAT. Surowy XML jest dostępny jako świadomy wybór
 * użytkownika, a nie jako domyślny widok.
 */
export function KsefInvoiceView({
  document,
  counterparty,
  direction,
}: {
  document: InvoiceDocument;
  counterparty: Counterparty | undefined;
  direction: "purchase" | "sale";
}) {
  const [mode, setMode] = useState<"structured" | "xml">("structured");
  const invoice = useMemo(
    () => documentToKsefInvoice(document, counterparty, direction),
    [document, counterparty, direction],
  );
  const xml = useMemo(() => (mode === "xml" ? serializeFa2(invoice) : ""), [mode, invoice]);

  const vatSummary = useMemo(() => {
    const byRate = new Map<number, { net: number; vat: number; gross: number }>();
    for (const line of document.lines) {
      const entry = byRate.get(line.vatRate) ?? { net: 0, vat: 0, gross: 0 };
      entry.net += line.netAmount;
      entry.vat += line.vatAmount;
      entry.gross += line.grossAmount;
      byRate.set(line.vatRate, entry);
    }
    return [...byRate.entries()].sort((left, right) => right[0] - left[0]);
  }, [document.lines]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg-muted">
          <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Faktura ustrukturyzowana — schemat KSeF FA(2)</span>
        </div>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "structured", label: "Dane faktury" },
            { value: "xml", label: "Źródłowy XML" },
          ]}
        />
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-auto">
        {mode === "xml" ? (
          <pre className="p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap text-fg-muted">
            <code>{xml}</code>
          </pre>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <InvoiceHeaderCard invoice={invoice} document={document} />

            <div className="grid gap-3 sm:grid-cols-2">
              <PartyCard title="Sprzedawca" party={invoice.seller} highlight={direction === "sale"} />
              <PartyCard title="Nabywca" party={invoice.buyer} highlight={direction === "purchase"} />
            </div>

            <section className="overflow-hidden rounded-xl border border-border">
              <header className="border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-fg-muted uppercase">
                Pozycje faktury
              </header>
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] tracking-wide text-fg-subtle uppercase">
                      <th className="px-3 py-1.5 font-medium">Nazwa</th>
                      <th className="px-3 py-1.5 text-right font-medium">Ilość</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cena netto</th>
                      <th className="px-3 py-1.5 text-right font-medium">VAT</th>
                      <th className="px-3 py-1.5 text-right font-medium">Netto</th>
                      <th className="px-3 py-1.5 text-right font-medium">Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {document.lines.map((line, index) => (
                      <tr key={line.id} className={cn("border-t border-border", index % 2 === 1 && "bg-surface-2/40")}>
                        <td className="px-3 py-2 text-fg">{line.name}</td>
                        <td className="tnum px-3 py-2 text-right whitespace-nowrap text-fg-muted">
                          {formatQuantity(line.quantity)} {line.unit}
                        </td>
                        <td className="tnum px-3 py-2 text-right whitespace-nowrap text-fg-muted">
                          {formatAmount(line.unitNetPrice, document.currency)}
                        </td>
                        <td className="tnum px-3 py-2 text-right whitespace-nowrap text-fg-muted">{line.vatRate}%</td>
                        <td className="tnum px-3 py-2 text-right whitespace-nowrap text-fg">
                          {formatAmount(line.netAmount, document.currency)}
                        </td>
                        <td className="tnum px-3 py-2 text-right font-medium whitespace-nowrap text-fg">
                          {formatAmount(line.grossAmount, document.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-border">
                <header className="border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-fg-muted uppercase">
                  Podsumowanie stawek VAT
                </header>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {vatSummary.map(([rate, totals]) => (
                      <tr key={rate} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 text-fg-muted">Stawka {rate}%</td>
                        <td className="tnum px-3 py-1.5 text-right text-fg-muted">
                          {formatAmount(totals.net, document.currency)}
                        </td>
                        <td className="tnum px-3 py-1.5 text-right text-fg">
                          {formatAmount(totals.vat, document.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col justify-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 py-3">
                <SummaryRow label="Razem netto" value={formatAmount(document.netAmount, document.currency)} />
                <SummaryRow label="Razem VAT" value={formatAmount(document.vatAmount, document.currency)} />
                <div className="mt-1 border-t border-border pt-2">
                  <SummaryRow
                    label="Do zapłaty"
                    value={formatAmount(document.grossAmount, document.currency)}
                    emphasis
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceHeaderCard({ invoice, document }: { invoice: KsefInvoice; document: InvoiceDocument }) {
  return (
    <section className="rounded-xl border border-border bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{invoice.invoiceNumber}</h3>
        <span className="tnum text-[15px] font-semibold text-fg">
          {formatAmount(document.grossAmount, document.currency)}
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
        <MetaItem label="Data wystawienia" value={formatDate(invoice.issueDate)} />
        <MetaItem label="Data sprzedaży" value={formatDate(invoice.saleDate)} />
        <MetaItem label="Termin płatności" value={formatDate(invoice.dueDate)} />
        <MetaItem label="Waluta" value={invoice.currency} />
        {document.ksefNumber ? (
          <MetaItem label="Numer KSeF" value={document.ksefNumber} mono className="col-span-2 sm:col-span-4" />
        ) : null}
        {invoice.paymentAccount ? (
          <MetaItem
            label="Rachunek do zapłaty"
            value={formatBankAccount(invoice.paymentAccount)}
            mono
            className="col-span-2 sm:col-span-4"
          />
        ) : null}
      </dl>
    </section>
  );
}

function MetaItem({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className={cn("truncate text-fg", mono && "tnum font-mono text-[12px]")}>{value}</dd>
    </div>
  );
}

function PartyCard({
  title,
  party,
  highlight,
}: {
  title: string;
  party: KsefInvoice["seller"];
  highlight: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border px-3.5 py-3",
        highlight ? "border-accent-border bg-accent-soft/40" : "border-border bg-surface",
      )}
    >
      <div className="flex items-center gap-2">
        <h4 className="text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</h4>
        {highlight ? (
          <span className="rounded bg-accent-soft px-1 text-[10.5px] font-medium text-accent">nasza firma</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[13.5px] leading-snug font-medium text-fg">{party.name}</p>
      <p className="tnum mt-0.5 text-[12.5px] text-fg-muted">NIP {formatNip(party.nip)}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
        {party.street}
        <br />
        {party.postalCode} {party.city}
        {party.country !== "PL" ? `, ${party.country}` : ""}
      </p>
    </section>
  );
}

function SummaryRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("text-[12.5px]", emphasis ? "font-medium text-fg" : "text-fg-muted")}>{label}</span>
      <span className={cn("tnum", emphasis ? "text-[15px] font-semibold text-fg" : "text-[13px] text-fg")}>
        {value}
      </span>
    </div>
  );
}
