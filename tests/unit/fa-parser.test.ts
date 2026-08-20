import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FaParseError, parseFaInvoice } from "@/server/fa-parser";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), name), "utf8");

/**
 * Testy parsera chodzą na prawdziwym pliku pobranym ze środowiska testowego
 * KSeF, a nie na XML-u napisanym pod test. To jest cała wartość tych
 * fixture'ów: gdyby Ministerstwo zmieniło kształt dokumentu, test padłby
 * dopiero po odświeżeniu pliku — ale przynajmniej padłby świadomie.
 */
describe("FA(3) — faktura pobrana z KSeF", () => {
  const parsed = parseFaInvoice(fixture("src/lib/ksef/__fixtures__/invoice-fa3-real.xml"));

  it("rozpoznaje wariant schematu", () => {
    expect(parsed.formCode).toContain("3");
  });

  it("czyta numer i daty", () => {
    expect(parsed.invoiceNumber).toBe("CN/2026/07/318");
    expect(parsed.issueDate).toBe("2026-07-24");
  });

  it("czyta termin płatności, którego nie ma w metadanych KSeF", () => {
    // Zapytanie o metadane zwraca kwoty i daty wystawienia, ale nie termin
    // zapłaty ani rachunku — dlatego import dociąga pełny XML. Ten test
    // pilnuje, żeby ta droga faktycznie dawała komplet danych do rejestru.
    expect(parsed.dueDate).toBe("2026-08-23");
    expect(parsed.paymentAccount).toBe("59890435956424360128023751");
  });

  it("czyta kwoty i walutę", () => {
    expect(parsed.netAmount).toBe(37800);
    expect(parsed.vatAmount).toBe(3024);
    expect(parsed.grossAmount).toBe(40824);
    expect(parsed.currency).toBe("PLN");
  });

  it("czyta obie strony transakcji wraz z adresem", () => {
    expect(parsed.seller.nip).toBe("9430928608");
    expect(parsed.seller.name).toBe("Cukrownia Nadwiślańska S.A.");
    expect(parsed.seller.postalCode).toBe("87-100");
    expect(parsed.seller.city).toBe("Toruń");
    expect(parsed.buyer.nip).toBe("6919478855");
  });

  it("czyta pozycje z ilością, ceną i stawką", () => {
    expect(parsed.lines).toHaveLength(1);
    const [line] = parsed.lines;
    expect(line.name).toContain("Cukier");
    expect(line.quantity).toBe(12);
    expect(line.unitNetPrice).toBe(3150);
    expect(line.vatRate).toBe(8);
    expect(line.netAmount).toBe(37800);
  });

  it("sumy pozycji zgadzają się z podsumowaniem faktury", () => {
    const linesNet = parsed.lines.reduce((sum, line) => sum + line.netAmount, 0);
    expect(linesNet).toBeCloseTo(parsed.netAmount, 2);
  });
});

describe("FA(2) — starszy schemat", () => {
  const parsed = parseFaInvoice(fixture("public/sample/faktura-ksef-fa2.xml"));

  it("czytany tym samym kodem co FA(3)", () => {
    // Oba schematy różnią się przestrzenią nazw, ale nie nazwami pól — parser
    // celowo ignoruje namespace, żeby nie mieć dwóch ścieżek do utrzymania.
    expect(parsed.formCode).toContain("2");
    expect(parsed.invoiceNumber).toBe("BES/0913/2026");
    expect(parsed.grossAmount).toBe(7728);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.dueDate).toBe("2026-09-13");
  });
});

describe("odrzucanie plików, które nie są fakturą", () => {
  it("odrzuca dokument bez elementu Faktura", () => {
    expect(() => parseFaInvoice("<cos/>")).toThrow(FaParseError);
  });

  it("odrzuca plik, który nie jest XML-em", () => {
    expect(() => parseFaInvoice("to zwykły tekst")).toThrow(FaParseError);
  });

  it("odrzuca nieobsługiwany wariant schematu", () => {
    const xml = `<?xml version="1.0"?><Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Naglowek><KodFormularza>FA</KodFormularza><WariantFormularza>9</WariantFormularza></Naglowek>
      <Fa><P_1>2026-01-01</P_1><P_2>X/1</P_2></Fa></Faktura>`;
    expect(() => parseFaInvoice(xml)).toThrow(/FA\(2\) i FA\(3\)/);
  });

  it("odrzuca fakturę bez numeru", () => {
    const xml = `<?xml version="1.0"?><Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Naglowek><KodFormularza>FA</KodFormularza><WariantFormularza>3</WariantFormularza></Naglowek>
      <Fa><P_1>2026-01-01</P_1></Fa></Faktura>`;
    expect(() => parseFaInvoice(xml)).toThrow(/numeru albo daty/);
  });
});
