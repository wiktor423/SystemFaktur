import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, DuplicateDocumentError } from "@/server/documents";
import { importFromKsef } from "@/server/ksef-import";
import { documentDraft, resetDatabase, seedMinimal, TYPE_COST } from "./fixtures";

/**
 * Odporność na duplikaty — wymaganie z sekcji 3.2 i 3.5 zadania.
 *
 * Sedno tych testów: deduplikacja jest ograniczeniem bazy, nie warunkiem
 * w kodzie. Różnica ujawnia się dopiero przy równoległości, bo sprawdzenie
 * „czy taki dokument już jest, a jeśli nie, to wstaw" ma okno między odczytem
 * a zapisem. Test z `Promise.all` celuje dokładnie w to okno.
 */
describe("odporność na duplikaty", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedMinimal();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("odrzuca ten sam numer faktury u tego samego kontrahenta", async () => {
    await createDocument(documentDraft());
    await expect(createDocument(documentDraft())).rejects.toBeInstanceOf(DuplicateDocumentError);
    expect(await prisma.document.count()).toBe(1);
  });

  it("dopuszcza ten sam numer u innego kontrahenta", async () => {
    // Numeracja faktur jest lokalna dla wystawcy — „FV/1/2026" od dwóch
    // różnych dostawców to dwa różne dokumenty, nie duplikat.
    await prisma.counterparty.create({
      data: { id: "cp-inny", name: "Cukrownia Nadwiślańska S.A.", nip: "9430928608", country: "PL" },
    });

    await createDocument(documentDraft());
    await createDocument(documentDraft({ counterpartyId: "cp-inny" }));

    expect(await prisma.document.count()).toBe(2);
  });

  it("wykrywa duplikat niezależnie od źródła dokumentu", async () => {
    // Wymaganie mówi wprost: ten sam dokument nie może powstać dwukrotnie,
    // także gdy raz przyszedł z KSeF, a raz został wgrany plikiem.
    await createDocument(documentDraft({ source: "ksef" }));
    await expect(createDocument(documentDraft({ source: "upload" }))).rejects.toBeInstanceOf(DuplicateDocumentError);
    expect(await prisma.document.count()).toBe(1);
  });

  it("odrzuca powtórzony numer KSeF nawet przy innym numerze faktury", async () => {
    const ksefNumber = "2650866478-20260820-6721D7C00000-53";
    await prisma.document.create({
      data: {
        ...toDbShape(documentDraft()),
        ksefNumber,
      },
    });

    await expect(
      prisma.document.create({
        data: { ...toDbShape(documentDraft({ number: "ZUPELNIE/INNY/1" })), ksefNumber },
      }),
    ).rejects.toThrow();

    expect(await prisma.document.count()).toBe(1);
  });

  it("przy dwóch równoległych zapisach powstaje dokładnie jeden dokument", async () => {
    // Tu leży cała stawka. Gdyby deduplikacja opierała się na odczycie
    // poprzedzającym zapis, oba wywołania zobaczyłyby pustą tabelę i oba
    // by wstawiły. Unikalny indeks przepuszcza tylko jedno.
    const results = await Promise.allSettled([
      createDocument(documentDraft()),
      createDocument(documentDraft()),
      createDocument(documentDraft()),
    ]);

    const accepted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(await prisma.document.count()).toBe(1);
  });
});

describe("import z KSeF", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedMinimal();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const range = { dateFrom: "2026-07-01", dateTo: "2026-08-31", scope: "both" as const, trigger: "manual" as const };

  it("powtórzone pobranie tego samego zakresu nie tworzy duplikatów", async () => {
    const first = await importFromKsef(range);
    expect(first.imported).toBeGreaterThan(0);
    expect(first.duplicates).toBe(0);

    const second = await importFromKsef(range);
    expect(second.fetched).toBe(first.fetched);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(first.fetched);

    expect(await prisma.document.count()).toBe(first.imported);
  });

  it("dwa importy uruchomione jednocześnie dają jeden komplet dokumentów", async () => {
    // Scenariusz z życia: użytkownik klika „Pobierz z KSeF" w momencie,
    // w którym budzi się harmonogram.
    const [left, right] = await Promise.all([importFromKsef(range), importFromKsef(range)]);

    const imported = left.imported + right.imported;
    const documents = await prisma.document.count();

    expect(documents).toBe(imported);
    expect(documents).toBe(left.fetched);
  });

  it("przypisuje kategorię z reguły kontrahenta", async () => {
    await importFromKsef(range);

    const withRule = await prisma.document.findFirst({
      where: { counterpartyId: "cp-pakpol" },
      select: { categoryId: true, categoryAutoAssigned: true },
    });

    expect(withRule?.categoryId).toBe("cat-opakowania");
    expect(withRule?.categoryAutoAssigned).toBe(true);
  });

  it("zapisuje przebieg w historii wraz z liczbą duplikatów", async () => {
    await importFromKsef(range);
    await importFromKsef(range);

    const runs = await prisma.ksefRun.findMany({ orderBy: { startedAt: "asc" } });
    expect(runs).toHaveLength(2);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[1].duplicates).toBeGreaterThan(0);
  });

  it("wszystkie pobrane dokumenty trafiają do bufora, nie do rejestru", async () => {
    // Dwuetapowy obieg z zadania: KSeF zasila poczekalnię, o wejściu
    // do ewidencji decyduje człowiek.
    await importFromKsef(range);

    const inRegister = await prisma.document.count({ where: { stage: "REGISTERED" } });
    const inBuffer = await prisma.document.count({ where: { stage: "BUFFER" } });

    expect(inRegister).toBe(0);
    expect(inBuffer).toBeGreaterThan(0);
  });
});

/** Zamiana kształtu formularza na kolumny bazy — na potrzeby zapisów wprost. */
function toDbShape(draft: ReturnType<typeof documentDraft>) {
  return {
    number: draft.number as string,
    typeId: TYPE_COST,
    counterpartyId: draft.counterpartyId as string,
    issueDate: new Date(`${draft.issueDate}T00:00:00Z`),
    dueDate: new Date(`${draft.dueDate}T00:00:00Z`),
    netAmount: draft.netAmount as number,
    vatAmount: draft.vatAmount as number,
    grossAmount: draft.grossAmount as number,
    source: "KSEF" as const,
    stage: "BUFFER" as const,
  };
}
