/**
 * Parser faktur ustrukturyzowanych KSeF: FA(2) i FA(3).
 *
 * Oba schematy różnią się przestrzenią nazw i zestawem pól opcjonalnych, ale
 * nazwy elementów, które nas interesują, są identyczne. Parser świadomie
 * ignoruje przestrzenie nazw i czyta po nazwach lokalnych — dzięki temu jeden
 * kod obsługuje oba warianty i nie wywróci się na FA(4), o ile nie zmienią
 * się nazwy pól.
 *
 * Weryfikowany na prawdziwej fakturze pobranej ze środowiska testowego KSeF
 * (`src/lib/ksef/__fixtures__/invoice-fa3-real.xml`).
 */
import { XMLParser } from "fast-xml-parser";
import type { KsefInvoiceLine, KsefParty } from "@/lib/ksef/client";

export class FaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaParseError";
  }
}

export interface ParsedInvoice {
  /** Wariant schematu odczytany z nagłówka, np. "FA (3)". */
  formCode: string;
  invoiceNumber: string;
  issueDate: string;
  saleDate: string | null;
  dueDate: string | null;
  currency: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentAccount: string | null;
  seller: KsefParty;
  buyer: KsefParty;
  lines: KsefInvoiceLine[];
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Nazwy lokalne bez prefiksu przestrzeni nazw — FA(2) i FA(3) różnią się
  // wyłącznie namespace'em, więc po jego zdjęciu obsługuje je ten sam kod.
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const asNode = (value: unknown): Node | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : null;

/** Zwraca zawsze tablicę — pojedynczy element XML nie jest tablicą w wyniku parsera. */
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

function text(node: Node | null, ...path: string[]): string | null {
  let current: unknown = node;
  for (const key of path) {
    const step = asNode(current);
    if (!step) return null;
    current = step[key];
  }
  if (current === null || current === undefined) return null;
  if (typeof current === "object") {
    // Element z atrybutami trzyma treść pod "#text".
    const inner = (current as Node)["#text"];
    return inner === undefined ? null : String(inner).trim();
  }
  const value = String(current).trim();
  return value === "" ? null : value;
}

/** Kwoty w KSeF są zapisane z kropką dziesiętną. */
function amount(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function party(node: Node | null, role: string): KsefParty {
  const nip = text(node, "DaneIdentyfikacyjne", "NIP");
  const name = text(node, "DaneIdentyfikacyjne", "Nazwa");
  if (!nip || !name) {
    throw new FaParseError(`Brak danych identyfikacyjnych podmiotu (${role}).`);
  }

  // AdresL2 ma postać "00-001 Warszawa" — rozbijamy na kod i miejscowość.
  const addressLine2 = text(node, "Adres", "AdresL2") ?? "";
  const match = addressLine2.match(/^\s*(\d{2}-\d{3})\s+(.*)$/);

  return {
    nip,
    name,
    street: text(node, "Adres", "AdresL1") ?? "",
    postalCode: match?.[1] ?? "",
    city: match?.[2]?.trim() ?? addressLine2,
    country: text(node, "Adres", "KodKraju") ?? "PL",
  };
}

function lines(fa: Node | null): KsefInvoiceLine[] {
  return asArray(fa?.["FaWiersz"]).map((raw, index) => {
    const row = asNode(raw);
    const quantity = amount(text(row, "P_8B")) || 1;
    const unitNetPrice = amount(text(row, "P_9A"));
    const netAmount = amount(text(row, "P_11")) || quantity * unitNetPrice;
    const vatRate = amount(text(row, "P_12"));
    const vatAmount = Math.round(netAmount * (vatRate / 100) * 100) / 100;

    return {
      name: text(row, "P_7") ?? `Pozycja ${index + 1}`,
      quantity,
      unit: text(row, "P_8A") ?? "szt",
      unitNetPrice,
      vatRate,
      netAmount,
      vatAmount,
      grossAmount: Math.round((netAmount + vatAmount) * 100) / 100,
    };
  });
}

export function parseFaInvoice(xml: string): ParsedInvoice {
  let document: Node;
  try {
    document = parser.parse(xml) as Node;
  } catch {
    throw new FaParseError("Pliku nie udało się odczytać jako XML.");
  }

  const invoice = asNode(document["Faktura"]);
  if (!invoice) {
    throw new FaParseError("To nie jest faktura w schemacie KSeF (brak elementu Faktura).");
  }

  const formCode = text(invoice, "Naglowek", "KodFormularza") ?? "";
  const variant = text(invoice, "Naglowek", "WariantFormularza");
  if (variant !== "2" && variant !== "3") {
    throw new FaParseError(`Obsługiwane są schematy FA(2) i FA(3); plik deklaruje wariant "${variant ?? "?"}".`);
  }

  const fa = asNode(invoice["Fa"]);
  const invoiceNumber = text(fa, "P_2");
  const issueDate = text(fa, "P_1");
  if (!invoiceNumber || !issueDate) {
    throw new FaParseError("Faktura nie zawiera numeru albo daty wystawienia.");
  }

  const parsedLines = lines(fa);
  const netAmount = amount(text(fa, "P_13_1")) || parsedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const vatAmount = amount(text(fa, "P_14_1")) || parsedLines.reduce((sum, line) => sum + line.vatAmount, 0);
  const grossAmount = amount(text(fa, "P_15")) || netAmount + vatAmount;

  const account = text(fa, "Platnosc", "RachunekBankowy", "NrRB");

  return {
    formCode: `${formCode} (${variant})`.replace(/^FA \(/, "FA ("),
    invoiceNumber,
    issueDate: issueDate.slice(0, 10),
    saleDate: text(fa, "P_6")?.slice(0, 10) ?? null,
    dueDate: text(fa, "Platnosc", "TerminPlatnosci", "Termin")?.slice(0, 10) ?? null,
    currency: text(fa, "KodWaluty") ?? "PLN",
    netAmount,
    vatAmount,
    grossAmount,
    paymentAccount: account ? account.replace(/[\s-]/g, "") : null,
    seller: party(asNode(invoice["Podmiot1"]), "sprzedawca"),
    buyer: party(asNode(invoice["Podmiot2"]), "nabywca"),
    lines: parsedLines,
  };
}
