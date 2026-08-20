import { KsefError, type KsefClient, type KsefFetchParams, type KsefInvoice, type KsefParty } from "@/lib/ksef/client";
import { seedCounterparties, seedDocuments } from "@/lib/data/seed";
import type { InvoiceDocument } from "@/lib/domain/types";

/**
 * Adapter mock środowiska KSeF.
 *
 * Zachowuje się jak prawdziwe API na tyle, na ile to potrzebne do zbudowania
 * i przetestowania obiegu: zwraca faktury z zakresu dat, potrafi zwrócić te
 * same dokumenty ponownie (test deduplikacji) i potrafi zasymulować awarię.
 * Docelowa implementacja `HttpKsefClient` zrealizuje ten sam interfejs na
 * bazie api-test.ksef.mf.gov.pl.
 */

/** Nasza firma — odbiorca faktur kosztowych, wystawca sprzedażowych. */
export const OWN_COMPANY: KsefParty = {
  nip: "6751234560",
  name: "Gumijagoda sp. z o.o.",
  street: "Jagodowa 7",
  postalCode: "34-300",
  city: "Żywiec",
  country: "PL",
};

function toParty(counterpartyId: string): KsefParty {
  const counterparty = seedCounterparties.find((item) => item.id === counterpartyId)!;
  return {
    nip: counterparty.nip,
    name: counterparty.name,
    street: counterparty.address.street,
    postalCode: counterparty.address.postalCode,
    city: counterparty.address.city,
    country: counterparty.address.country,
  };
}

function toKsefInvoice(document: InvoiceDocument, direction: "purchase" | "sale"): KsefInvoice {
  const counterparty = toParty(document.counterpartyId);
  return {
    ksefNumber: document.ksefNumber ?? `${counterparty.nip}-${document.issueDate.replace(/-/g, "")}-MOCK${document.id.slice(-3)}-01`,
    invoiceNumber: document.number,
    issueDate: document.issueDate,
    saleDate: document.saleDate,
    dueDate: document.dueDate,
    currency: document.currency,
    seller: direction === "purchase" ? counterparty : OWN_COMPANY,
    buyer: direction === "purchase" ? OWN_COMPANY : counterparty,
    lines: document.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitNetPrice: line.unitNetPrice,
      vatRate: line.vatRate,
      netAmount: line.netAmount,
      vatAmount: line.vatAmount,
      grossAmount: line.grossAmount,
    })),
    netAmount: document.netAmount,
    vatAmount: document.vatAmount,
    grossAmount: document.grossAmount,
    paymentAccount: document.paymentAccount,
    direction,
    acquisitionTimestamp: document.receivedAt,
  };
}

export interface MockKsefOptions {
  /** Sztuczne opóźnienie odpowiedzi (ms) — pokazuje stany ładowania w UI. */
  latencyMs?: number;
  /** Wymusza błąd integracji — do demonstracji obsługi awarii KSeF. */
  simulateFailure?: boolean;
}

export class MockKsefClient implements KsefClient {
  constructor(private readonly options: MockKsefOptions = {}) {}

  async fetchInvoices(params: KsefFetchParams): Promise<KsefInvoice[]> {
    const { latencyMs = 900, simulateFailure = false } = this.options;
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    if (simulateFailure) {
      throw new KsefError(
        "Środowisko testowe KSeF nie odpowiedziało w wyznaczonym czasie (HTTP 504). Żaden dokument nie został pobrany — spróbuj ponownie za chwilę.",
        "timeout",
      );
    }

    if (params.dateFrom > params.dateTo) {
      throw new KsefError("Data początkowa zakresu jest późniejsza niż końcowa.", "invalid-range");
    }

    // KSeF zwraca wszystko z zakresu — także dokumenty, które już mamy.
    // Deduplikacją zajmuje się warstwa aplikacji, nie integracja.
    const pool = seedDocuments.filter(
      (document) => document.issueDate >= params.dateFrom && document.issueDate <= params.dateTo,
    );

    const invoices: KsefInvoice[] = [];
    for (const document of pool) {
      const direction: "purchase" | "sale" = document.typeId === "type-sale" ? "sale" : "purchase";
      if (params.scope !== "both" && params.scope !== direction) continue;
      invoices.push(toKsefInvoice(document, direction));
    }

    // Do zakresu obejmującego dzisiejszy dzień dokładamy „świeże” faktury,
    // żeby ręczne pobranie zawsze miało czym zasilić bufor.
    if (params.dateTo >= new Date().toISOString().slice(0, 10)) {
      invoices.push(...syntheticFreshInvoices(params));
    }

    return invoices;
  }
}

/** Kilka nowych faktur „z dzisiaj”, generowanych na podstawie kontrahentów. */
function syntheticFreshInvoices(params: KsefFetchParams): KsefInvoice[] {
  const today = new Date().toISOString().slice(0, 10);
  // Numery są deterministyczne dla danego dnia — ponowne pobranie tego samego
  // zakresu musi trafić na duplikaty, tak jak przy prawdziwym KSeF.
  const stamp = today.replace(/-/g, "").slice(2);

  const drafts: Array<{ counterpartyId: string; direction: "purchase" | "sale"; name: string; quantity: number; unit: string; price: number; vat: number }> = [
    { counterpartyId: "cp-pakpol", direction: "purchase", name: "Słoik 320 ml z zakrętką twist-off", quantity: 4800, unit: "szt.", price: 1.28, vat: 23 },
    { counterpartyId: "cp-owoce-beskid", direction: "purchase", name: "Gumijagody klasa I — zbiór ręczny", quantity: 260, unit: "kg", price: 18.4, vat: 5 },
    { counterpartyId: "cp-siecdelikatesy", direction: "sale", name: "Konfitura gumijagodowa 320 ml", quantity: 1440, unit: "szt.", price: 14.9, vat: 5 },
  ];

  return drafts
    .filter((draft) => params.scope === "both" || params.scope === draft.direction)
    .map((draft, index) => {
      const counterparty = toParty(draft.counterpartyId);
      const netAmount = Math.round(draft.quantity * draft.price * 100) / 100;
      const vatAmount = Math.round(netAmount * draft.vat) / 100; // net * stawka% z zaokrągleniem do grosza
      const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;
      const source = seedCounterparties.find((item) => item.id === draft.counterpartyId)!;

      return {
        ksefNumber: `${counterparty.nip}-${today.replace(/-/g, "")}-${stamp}${index}-A1`,
        invoiceNumber:
          draft.direction === "purchase"
            ? `${draft.counterpartyId.replace("cp-", "").slice(0, 3).toUpperCase()}/${stamp}${index}/${today.slice(0, 4)}`
            : `GJ/${today.slice(0, 7).replace("-", "/")}/${stamp}${index}`,
        issueDate: today,
        saleDate: today,
        dueDate: addDays(today, 21),
        currency: "PLN",
        seller: draft.direction === "purchase" ? counterparty : OWN_COMPANY,
        buyer: draft.direction === "purchase" ? OWN_COMPANY : counterparty,
        lines: [
          {
            name: draft.name,
            quantity: draft.quantity,
            unit: draft.unit,
            unitNetPrice: draft.price,
            vatRate: draft.vat,
            netAmount,
            vatAmount,
            grossAmount,
          },
        ],
        netAmount,
        vatAmount,
        grossAmount,
        paymentAccount: source.bankAccount,
        direction: draft.direction,
        acquisitionTimestamp: new Date().toISOString(),
      } satisfies KsefInvoice;
    });
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

let client: KsefClient | null = null;
let currentOptions: MockKsefOptions = {};

/** Punkt wymiany implementacji — jedyne miejsce, które zna konkretny adapter. */
export function getKsefClient(options?: MockKsefOptions): KsefClient {
  if (!client || (options && JSON.stringify(options) !== JSON.stringify(currentOptions))) {
    currentOptions = options ?? {};
    client = new MockKsefClient(currentOptions);
  }
  return client;
}
