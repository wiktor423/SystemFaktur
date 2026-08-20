/**
 * Zasilenie bazy danymi demonstracyjnymi.
 *
 * Definicje pochodzą z `src/lib/data/seed.ts` — tego samego modułu, który
 * napędzał frontend na mockach. Jedno źródło danych demonstracyjnych zamiast
 * dwóch rozjeżdżających się kopii.
 *
 * Uruchomienie: `npm run db:seed`. Skrypt jest idempotentny (upsert), więc
 * powtórne wywołanie nie tworzy duplikatów.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  seedCategories,
  seedCounterparties,
  seedDocumentTypes,
  seedDocuments,
  seedKsefRuns,
  seedSchedule,
} from "../src/lib/data/seed.js";
import { DEFAULT_COLUMNS } from "../src/lib/data/columns.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * NIP-y podmiotów, które istnieją w naszej piaskownicy KSeF. Kartoteka musi
 * używać dokładnie tych numerów — inaczej import z KSeF nie rozpozna
 * kontrahenta i założy drugą kartotekę dla tej samej firmy.
 */
const SANDBOX_NIPS: Record<string, string> = {
  "PakPol Opakowania sp. z o.o.": "2650866478",
  "Cukrownia Nadwiślańska S.A.": "9430928608",
  "ChłodTrans Logistyka sp.j.": "4291146318",
  "Delikatesy Południe S.A.": "5455943157",
  "MarketWit Sieci Handlowe sp. z o.o.": "7850931102",
  "Cukiernia Pod Jagodą Anna Malinowska": "3232624106",
};

/** Numery faktur żyjących w piaskownicy — pomijamy je, żeby pierwsze pobranie
 *  z KSeF pokazało realny import, a nie same duplikaty. */
const SANDBOX_INVOICE_NUMBERS = new Set([
  "PAK/0181/2026", "PAK/0207/2026", "CN/2026/07/318", "CN/2026/08/402",
  "CHT/1142/08/2026", "GJ/2026/07/118", "GJ/2026/08/001", "GJ/2026/08/014", "GJ/2026/08/026",
]);

const digitsOnly = (value: string) => value.replace(/[^0-9]/g, "");
const upper = <T extends string>(value: string) => value.toUpperCase() as Uppercase<T>;
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  console.log("Czyszczenie…");
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

  // Kategorie: najpierw korzenie, potem dzieci — relacja wskazuje na tę samą tabelę.
  const roots = seedCategories.filter((category) => category.parentId === null);
  const children = seedCategories.filter((category) => category.parentId !== null);
  for (const category of [...roots, ...children]) {
    await prisma.category.create({
      data: { id: category.id, name: category.name, color: category.color, parentId: category.parentId },
    });
  }
  console.log(`Kategorie: ${seedCategories.length}`);

  await prisma.documentType.createMany({
    data: seedDocumentTypes.map((type) => ({
      id: type.id,
      name: type.name,
      shortName: type.shortName,
      direction: upper(type.direction),
      isSystem: type.isSystem,
    })),
  });
  console.log(`Typy dokumentów: ${seedDocumentTypes.length}`);

  let aligned = 0;
  for (const counterparty of seedCounterparties) {
    const sandboxNip = SANDBOX_NIPS[counterparty.name];
    if (sandboxNip) aligned += 1;
    await prisma.counterparty.create({
      data: {
        id: counterparty.id,
        name: counterparty.name,
        nip: sandboxNip ?? digitsOnly(counterparty.nip),
        street: counterparty.address.street,
        postalCode: counterparty.address.postalCode,
        city: counterparty.address.city,
        country: counterparty.address.country,
        bankAccount: counterparty.bankAccount ? counterparty.bankAccount.replace(/\s/g, "") : null,
        defaultCategoryId: counterparty.defaultCategoryId,
      },
    });
  }
  console.log(`Kontrahenci: ${seedCounterparties.length} (NIP uzgodniony z piaskownicą KSeF: ${aligned})`);

  const attachmentCache = new Map<string, Buffer>();
  const loadSample = async (url: string) => {
    if (!attachmentCache.has(url)) {
      attachmentCache.set(url, await readFile(path.join(process.cwd(), "public", url)));
    }
    return attachmentCache.get(url)!;
  };

  let skipped = 0;
  let created = 0;
  for (const document of seedDocuments) {
    if (SANDBOX_INVOICE_NUMBERS.has(document.number)) {
      skipped += 1;
      continue;
    }

    await prisma.document.create({
      data: {
        id: document.id,
        number: document.number,
        typeId: document.typeId,
        counterpartyId: document.counterpartyId,
        issueDate: asDate(document.issueDate),
        saleDate: document.saleDate ? asDate(document.saleDate) : null,
        dueDate: asDate(document.dueDate),
        netAmount: document.netAmount,
        vatAmount: document.vatAmount,
        grossAmount: document.grossAmount,
        currency: document.currency,
        paymentAccount: document.paymentAccount?.replace(/\s/g, "") ?? null,
        categoryId: document.categoryId,
        categoryAutoAssigned: document.categoryAutoAssigned,
        source: upper(document.source),
        ksefNumber: document.ksefNumber,
        stage: document.stage === "buffer" ? "BUFFER" : "REGISTERED",
        bufferDecision: upper(document.bufferDecision),
        paymentStatus: upper(document.paymentStatus),
        notes: document.notes,
        receivedAt: new Date(document.receivedAt),
        registeredAt: document.registeredAt ? new Date(document.registeredAt) : null,
        lines: {
          create: document.lines.map((line, index) => ({
            position: index + 1,
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            unitNetPrice: line.unitNetPrice,
            vatRate: line.vatRate,
            netAmount: line.netAmount,
            vatAmount: line.vatAmount,
            grossAmount: line.grossAmount,
          })),
        },
        ...(document.attachment
          ? {
              attachment: {
                create: {
                  kind: upper(document.attachment.kind),
                  filename: document.attachment.filename,
                  contentType: document.attachment.kind === "pdf" ? "application/pdf" : "application/xml",
                  size: document.attachment.size,
                  content: await loadSample(document.attachment.url),
                },
              },
            }
          : {}),
      },
    });
    created += 1;
  }
  console.log(`Dokumenty: ${created}${skipped ? ` (pominięto ${skipped} kolidujących z piaskownicą KSeF)` : ""}`);

  await prisma.ksefSchedule.upsert({
    where: { singleton: true },
    create: {
      singleton: true,
      enabled: seedSchedule.enabled,
      times: seedSchedule.times,
      scope: upper(seedSchedule.scope),
      lookbackDays: seedSchedule.lookbackDays,
    },
    update: {},
  });

  await prisma.ksefRun.createMany({
    data: seedKsefRuns.map((run) => ({
      id: run.id,
      trigger: upper(run.trigger),
      scope: upper(run.scope),
      dateFrom: asDate(run.dateFrom),
      dateTo: asDate(run.dateTo),
      status: upper(run.status),
      fetched: run.fetched,
      imported: run.imported,
      duplicates: run.duplicates,
      message: run.message,
      startedAt: new Date(run.startedAt),
      finishedAt: new Date(run.startedAt),
    })),
  });
  console.log(`Historia pobrań: ${seedKsefRuns.length}`);

  await prisma.columnPreference.createMany({
    data: DEFAULT_COLUMNS.map((column, index) => ({
      key: column.key,
      visible: column.visible,
      position: index,
    })),
  });
  console.log(`Kolumny rejestru: ${DEFAULT_COLUMNS.length}`);
}

main()
  .then(() => console.log("\nGotowe."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
