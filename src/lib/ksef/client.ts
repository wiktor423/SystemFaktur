import type { KsefFetchScope } from "@/lib/domain/types";

/**
 * Granica integracji z KSeF.
 *
 * Reszta aplikacji zna wyłącznie ten interfejs — nie wie, czy po drugiej
 * stronie jest środowisko testowe Ministerstwa Finansów, czy adapter mock.
 * Wymiana implementacji to podmiana jednej instancji w `getKsefClient()`,
 * a docelowo wywołanie będzie żyło po stronie serwera (route handler),
 * bo tokeny KSeF nie mogą trafić do przeglądarki.
 */

export interface KsefParty {
  nip: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface KsefInvoiceLine {
  name: string;
  quantity: number;
  unit: string;
  unitNetPrice: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

/** Faktura zwrócona przez KSeF, w kształcie niezależnym od modelu aplikacji. */
export interface KsefInvoice {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  saleDate: string | null;
  dueDate: string;
  currency: string;
  seller: KsefParty;
  buyer: KsefParty;
  lines: KsefInvoiceLine[];
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentAccount: string | null;
  /** Kierunek z perspektywy naszej firmy: zakup (koszt) albo sprzedaż. */
  direction: "purchase" | "sale";
  acquisitionTimestamp: string;
}

export interface KsefFetchParams {
  dateFrom: string;
  dateTo: string;
  scope: KsefFetchScope;
}

export interface KsefClient {
  /** Pobiera faktury z zadanego zakresu. Rzuca `KsefError` przy błędzie sesji. */
  fetchInvoices(params: KsefFetchParams): Promise<KsefInvoice[]>;
}

/** Błąd integracji — komunikat jest przeznaczony do pokazania użytkownikowi. */
export class KsefError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "timeout" | "unavailable" | "invalid-range",
  ) {
    super(message);
    this.name = "KsefError";
  }
}
