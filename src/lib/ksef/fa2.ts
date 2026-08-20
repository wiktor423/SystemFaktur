import type { KsefInvoice, KsefParty } from "@/lib/ksef/client";

/**
 * Obsługa formatu FA(2)/FA(3) — serializacja do podglądu źródła oraz parsowanie
 * pliku wgranego przez użytkownika.
 *
 * Zakres celowo ograniczony do pól, które wykorzystuje aplikacja. Pełna
 * obsługa schematu (wszystkie warianty P_ i sekcje opcjonalne) należy do
 * backendu; tutaj interesuje nas czytelna prezentacja i auto-uzupełnienie
 * formularza.
 */

const NAMESPACE = "http://crd.gov.pl/wzor/2023/06/29/12648/";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number): string {
  return value.toFixed(2);
}

function partyXml(tag: string, party: KsefParty): string {
  return `  <${tag}>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(party.nip)}</NIP>
      <Nazwa>${escapeXml(party.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${escapeXml(party.country)}</KodKraju>
      <AdresL1>${escapeXml(party.street)}</AdresL1>
      <AdresL2>${escapeXml(`${party.postalCode} ${party.city}`)}</AdresL2>
    </Adres>
  </${tag}>`;
}

/** Buduje dokument FA(2) — używany w podglądzie „źródłowy XML”. */
export function serializeFa2(invoice: KsefInvoice): string {
  const lines = invoice.lines
    .map(
      (line, index) => `    <FaWiersz>
      <NrWierszaFa>${index + 1}</NrWierszaFa>
      <P_7>${escapeXml(line.name)}</P_7>
      <P_8A>${escapeXml(line.unit)}</P_8A>
      <P_8B>${line.quantity}</P_8B>
      <P_9A>${money(line.unitNetPrice)}</P_9A>
      <P_11>${money(line.netAmount)}</P_11>
      <P_12>${line.vatRate}</P_12>
    </FaWiersz>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${NAMESPACE}">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>${invoice.acquisitionTimestamp}</DataWytworzeniaFa>
    <SystemInfo>Gumijagoda — moduł faktur</SystemInfo>
  </Naglowek>
${partyXml("Podmiot1", invoice.seller)}
${partyXml("Podmiot2", invoice.buyer)}
  <Fa>
    <KodWaluty>${escapeXml(invoice.currency)}</KodWaluty>
    <P_1>${invoice.issueDate}</P_1>
    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>
    <P_6>${invoice.saleDate ?? invoice.issueDate}</P_6>
    <P_13_1>${money(invoice.netAmount)}</P_13_1>
    <P_14_1>${money(invoice.vatAmount)}</P_14_1>
    <P_15>${money(invoice.grossAmount)}</P_15>
    <Platnosc>
      <TerminPlatnosci>
        <Termin>${invoice.dueDate}</Termin>
      </TerminPlatnosci>${
        invoice.paymentAccount
          ? `
      <RachunekBankowy>
        <NrRB>${escapeXml(invoice.paymentAccount)}</NrRB>
      </RachunekBankowy>`
          : ""
      }
    </Platnosc>
${lines}
  </Fa>
</Faktura>
`;
}

export interface ParsedFa2 {
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
  lines: KsefInvoice["lines"];
}

export class Fa2ParseError extends Error {}

function text(scope: Element | Document, selector: string): string {
  const node = scope.querySelector(selector);
  return node?.textContent?.trim() ?? "";
}

function number(scope: Element | Document, selector: string): number {
  const raw = text(scope, selector).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseParty(root: Document, tag: string): KsefParty {
  const node = root.querySelector(tag);
  if (!node) {
    throw new Fa2ParseError(`Brak sekcji ${tag} w pliku XML.`);
  }
  const addressL2 = text(node, "AdresL2");
  const match = addressL2.match(/^(\d{2}-\d{3})\s+(.*)$/);
  return {
    nip: text(node, "NIP"),
    name: text(node, "Nazwa"),
    street: text(node, "AdresL1"),
    postalCode: match?.[1] ?? "",
    city: match?.[2] ?? addressL2,
    country: text(node, "KodKraju") || "PL",
  };
}

/**
 * Parsuje plik FA(2)/FA(3) wgrany przez użytkownika.
 * Działa w przeglądarce (DOMParser); po stronie serwera zastąpi go parser XML
 * z walidacją względem oficjalnego XSD.
 */
export function parseFa2(xml: string): ParsedFa2 {
  const parser = new DOMParser();
  const document_ = parser.parseFromString(xml, "application/xml");

  if (document_.querySelector("parsererror")) {
    throw new Fa2ParseError("Pliku nie udało się odczytać — nieprawidłowy XML.");
  }
  if (!document_.querySelector("Faktura")) {
    throw new Fa2ParseError("To nie jest faktura w schemacie KSeF FA — brak elementu <Faktura>.");
  }

  const invoiceNumber = text(document_, "P_2");
  const issueDate = text(document_, "P_1");
  if (!invoiceNumber || !issueDate) {
    throw new Fa2ParseError("W pliku brakuje numeru faktury (P_2) lub daty wystawienia (P_1).");
  }

  const lines = Array.from(document_.querySelectorAll("FaWiersz")).map((node) => {
    const quantity = number(node, "P_8B");
    const unitNetPrice = number(node, "P_9A");
    const netAmount = number(node, "P_11") || Math.round(quantity * unitNetPrice * 100) / 100;
    const vatRate = number(node, "P_12");
    const vatAmount = Math.round(netAmount * vatRate) / 100;
    return {
      name: text(node, "P_7"),
      quantity,
      unit: text(node, "P_8A"),
      unitNetPrice,
      vatRate,
      netAmount,
      vatAmount,
      grossAmount: Math.round((netAmount + vatAmount) * 100) / 100,
    };
  });

  const netAmount = number(document_, "P_13_1") || lines.reduce((sum, line) => sum + line.netAmount, 0);
  const vatAmount = number(document_, "P_14_1") || lines.reduce((sum, line) => sum + line.vatAmount, 0);
  const grossAmount = number(document_, "P_15") || Math.round((netAmount + vatAmount) * 100) / 100;

  return {
    invoiceNumber,
    issueDate,
    saleDate: text(document_, "P_6") || null,
    dueDate: text(document_, "Termin") || null,
    currency: text(document_, "KodWaluty") || "PLN",
    netAmount,
    vatAmount,
    grossAmount,
    paymentAccount: text(document_, "NrRB") || null,
    seller: parseParty(document_, "Podmiot1"),
    buyer: parseParty(document_, "Podmiot2"),
    lines,
  };
}
