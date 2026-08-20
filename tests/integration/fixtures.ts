import { prisma } from "@/lib/db";

/**
 * Minimalny zestaw danych, bez którego import nie ma się o co oprzeć:
 * dwa systemowe typy dokumentów i kartoteki kontrahentów zgodne z tym,
 * co zwraca adapter mock KSeF.
 */
export const TYPE_COST = "type-cost";
export const TYPE_SALE = "type-sale";

/** Kolejność kasowania wynika z kluczy obcych — od liści do korzeni. */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.attachment.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.document.deleteMany(),
    prisma.counterparty.deleteMany(),
    prisma.category.deleteMany(),
    prisma.documentType.deleteMany(),
    prisma.ksefRun.deleteMany(),
    prisma.columnPreference.deleteMany(),
  ]);
  await prisma.ksefSchedule.deleteMany();
}

export async function seedMinimal(): Promise<void> {
  await prisma.documentType.createMany({
    data: [
      { id: TYPE_COST, name: "Faktura kosztowa", shortName: "FK", direction: "PAYABLE", isSystem: true },
      { id: TYPE_SALE, name: "Faktura sprzedażowa", shortName: "FS", direction: "RECEIVABLE", isSystem: true },
    ],
  });

  await prisma.category.create({ data: { id: "cat-opakowania", name: "Opakowania" } });

  await prisma.counterparty.create({
    data: {
      id: "cp-pakpol",
      name: "PakPol Opakowania sp. z o.o.",
      nip: "2650866478",
      country: "PL",
      // Reguła „kontrahent -> kategoria” — sprawdzana przy imporcie.
      defaultCategoryId: "cat-opakowania",
    },
  });
}

/** Dokument w kształcie, jakiego oczekuje `createDocument`. */
export function documentDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    number: "FV/1/2026",
    typeId: TYPE_COST,
    counterpartyId: "cp-pakpol",
    issueDate: "2026-08-01",
    saleDate: null,
    dueDate: "2026-08-15",
    netAmount: 1000,
    vatAmount: 230,
    grossAmount: 1230,
    currency: "PLN",
    paymentAccount: null,
    categoryId: null,
    notes: null,
    lines: [],
    source: "manual" as const,
    stage: "registered" as const,
    ...overrides,
  };
}
