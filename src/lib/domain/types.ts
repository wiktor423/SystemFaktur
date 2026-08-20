/**
 * Model domenowy aplikacji.
 *
 * Ten plik jest celowo wolny od zależności od Reacta i od warstwy transportu —
 * te same typy będą obowiązywać po stronie backendu (Prisma / route handlers),
 * a schematy Zod powstaną na ich podstawie. Frontend nie definiuje własnych,
 * równoległych kształtów danych.
 */

/** Kierunek dokumentu: należność (do otrzymania) albo zobowiązanie (do zapłaty). */
export type DocumentDirection = "receivable" | "payable";

/** Skąd dokument trafił do systemu. */
export type DocumentSource = "ksef" | "upload" | "manual";

/** Etap obiegu: poczekalnia (bufor) albo rejestr dokumentów. */
export type DocumentStage = "buffer" | "registered";

/** Status rozliczenia dokumentu. `overdue` jest wyliczany z terminu płatności. */
export type PaymentStatus = "unpaid" | "partial" | "paid";

/** Rozstrzygnięcie pozycji w buforze. */
export type BufferDecision = "pending" | "accepted" | "rejected";

/** Typ dokumentu — dwa typy systemowe, resztę definiuje użytkownik. */
export interface DocumentType {
  id: string;
  name: string;
  direction: DocumentDirection;
  /** Typy systemowe (faktura sprzedażowa / kosztowa) nie mogą zostać usunięte. */
  isSystem: boolean;
  /** Skrót do wyświetlenia w tabeli, np. „FS”, „FK”, „NO”. */
  shortName: string;
}

export interface Address {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface Counterparty {
  id: string;
  name: string;
  nip: string;
  address: Address;
  bankAccount: string | null;
  /** Reguła auto-kategoryzacji: dokumenty tego kontrahenta trafiają tutaj. */
  defaultCategoryId: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  /** Kolor znacznika na liście — czysto prezentacyjny. */
  color: string | null;
}

/** Pozycja faktury — wypełniana z XML KSeF lub ręcznie. */
export interface InvoiceLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitNetPrice: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

export type AttachmentKind = "pdf" | "xml";

export interface Attachment {
  kind: AttachmentKind;
  filename: string;
  /** Rozmiar w bajtach. */
  size: number;
  /** URL do pobrania treści. W wersji mock wskazuje na plik w /public. */
  url: string;
}

export interface InvoiceDocument {
  id: string;
  number: string;
  typeId: string;
  counterpartyId: string;

  issueDate: string; // ISO yyyy-mm-dd
  saleDate: string | null;
  dueDate: string; // ISO yyyy-mm-dd

  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  currency: string;

  /** Rachunek do zapłaty (NRB/IBAN) — z faktury, nie z kartoteki kontrahenta. */
  paymentAccount: string | null;

  categoryId: string | null;
  /** Czy kategorię przypisała reguła „kontrahent → kategoria”. */
  categoryAutoAssigned: boolean;

  source: DocumentSource;
  ksefNumber: string | null;

  stage: DocumentStage;
  bufferDecision: BufferDecision;
  paymentStatus: PaymentStatus;

  attachment: Attachment | null;
  lines: InvoiceLine[];
  notes: string | null;

  /** Znacznik czasu wpłynięcia do systemu (import / upload / dodanie ręczne). */
  receivedAt: string; // ISO datetime
  /** Znacznik czasu przeniesienia do rejestru; null dopóki jest w buforze. */
  registeredAt: string | null;
}

/** Harmonogram automatycznego pobierania z KSeF. */
export interface KsefSchedule {
  enabled: boolean;
  /** Godziny uruchomień w formacie HH:mm, dowolna liczba w ciągu doby. */
  times: string[];
  /** Zakres pobierania przy automatycznym uruchomieniu. */
  scope: KsefFetchScope;
  /** Ile dni wstecz obejmuje automatyczne pobranie. */
  lookbackDays: number;
  /** Wymusza błąd przy następnym pobraniu — do demonstracji obsługi awarii. */
  simulateFailure: boolean;
}

/** Rodzaj faktur do pobrania z KSeF. */
export type KsefFetchScope = "purchase" | "sale" | "both";

export type KsefRunTrigger = "manual" | "schedule";
export type KsefRunStatus = "success" | "partial" | "error";

/** Wpis w historii pobrań z KSeF — podstawa diagnostyki błędów integracji. */
export interface KsefRun {
  id: string;
  startedAt: string;
  trigger: KsefRunTrigger;
  scope: KsefFetchScope;
  dateFrom: string;
  dateTo: string;
  status: KsefRunStatus;
  /** Liczba faktur zwróconych przez KSeF. */
  fetched: number;
  /** Ile z nich trafiło do bufora (reszta to duplikaty). */
  imported: number;
  duplicates: number;
  message: string | null;
}

/** Definicja kolumny rejestru — sterowana przez użytkownika. */
export interface ColumnConfig {
  key: DocumentColumnKey;
  visible: boolean;
}

export type DocumentColumnKey =
  | "number"
  | "type"
  | "counterparty"
  | "nip"
  | "issueDate"
  | "dueDate"
  | "netAmount"
  | "vatAmount"
  | "grossAmount"
  | "category"
  | "source"
  | "paymentAccount"
  | "ksefNumber"
  | "paymentStatus";

/** Kryteria filtrowania rejestru / bufora. */
export interface DocumentFilters {
  search: string;
  typeIds: string[];
  counterpartyIds: string[];
  categoryIds: string[];
  sources: DocumentSource[];
  paymentStatuses: PaymentStatus[];
  issueDateFrom: string | null;
  issueDateTo: string | null;
  dueDateFrom: string | null;
  dueDateTo: string | null;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: DocumentColumnKey;
  direction: SortDirection;
}
