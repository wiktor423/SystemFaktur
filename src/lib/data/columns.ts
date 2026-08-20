import type { ColumnConfig, DocumentColumnKey } from "@/lib/domain/types";

/** Metadane kolumny rejestru — etykieta, wyrównanie, możliwość sortowania. */
export interface ColumnDefinition {
  key: DocumentColumnKey;
  label: string;
  align: "left" | "right";
  sortable: boolean;
  /** Kolumny obowiązkowe zawsze pozostają widoczne. */
  locked?: boolean;
  /** Szerokość sugerowana — tabela i tak dopasowuje się do treści. */
  width?: string;
  description?: string;
}

export const COLUMN_DEFINITIONS: Record<DocumentColumnKey, ColumnDefinition> = {
  number: { key: "number", label: "Numer", align: "left", sortable: true, locked: true, width: "13rem" },
  type: { key: "type", label: "Typ", align: "left", sortable: true, width: "9rem" },
  counterparty: { key: "counterparty", label: "Kontrahent", align: "left", sortable: true, width: "18rem" },
  nip: { key: "nip", label: "NIP", align: "left", sortable: true, width: "9rem" },
  issueDate: { key: "issueDate", label: "Data wystawienia", align: "left", sortable: true, width: "9rem" },
  dueDate: { key: "dueDate", label: "Termin płatności", align: "left", sortable: true, width: "11rem" },
  netAmount: { key: "netAmount", label: "Netto", align: "right", sortable: true, width: "8rem" },
  vatAmount: { key: "vatAmount", label: "VAT", align: "right", sortable: true, width: "7rem" },
  grossAmount: { key: "grossAmount", label: "Brutto", align: "right", sortable: true, width: "9rem" },
  category: { key: "category", label: "Kategoria", align: "left", sortable: true, width: "13rem" },
  source: { key: "source", label: "Źródło", align: "left", sortable: true, width: "7rem" },
  paymentStatus: { key: "paymentStatus", label: "Status", align: "left", sortable: true, width: "8rem" },
  paymentAccount: { key: "paymentAccount", label: "Rachunek do zapłaty", align: "left", sortable: false, width: "16rem" },
  ksefNumber: { key: "ksefNumber", label: "Numer KSeF", align: "left", sortable: true, width: "16rem" },
};

/**
 * Domyślny układ rejestru. Kolejność w tej tablicy jest kolejnością kolumn —
 * użytkownik zmienia ją przeciągnięciem w panelu konfiguracji.
 */
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "number", visible: true },
  { key: "type", visible: true },
  { key: "counterparty", visible: true },
  { key: "category", visible: true },
  { key: "issueDate", visible: true },
  { key: "dueDate", visible: true },
  { key: "netAmount", visible: false },
  { key: "vatAmount", visible: false },
  { key: "grossAmount", visible: true },
  { key: "source", visible: true },
  { key: "paymentStatus", visible: true },
  { key: "nip", visible: false },
  { key: "paymentAccount", visible: false },
  { key: "ksefNumber", visible: false },
];

/** Kolumny widoczne w buforze — węższy, stały zestaw. */
export const BUFFER_COLUMNS: DocumentColumnKey[] = [
  "number",
  "type",
  "counterparty",
  "category",
  "issueDate",
  "dueDate",
  "grossAmount",
  "source",
];
