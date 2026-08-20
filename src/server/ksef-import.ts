/**
 * Import faktur z KSeF do bufora.
 *
 * Serce odporności na duplikaty. Aplikacja nie sprawdza „czy taki dokument już
 * jest, a jeśli nie, to wstaw" — takie sprawdzenie przepuszcza duplikat, gdy
 * dwa pobrania (ręczne i z harmonogramu, albo dwie repliki) trafią na siebie
 * w czasie. Zamiast tego wstawiamy i pozwalamy bazie odrzucić kolizję na
 * unikalnym indeksie. Odrzucenie jest normalnym wynikiem, nie błędem.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { KsefError, type KsefInvoice, type KsefInvoiceLine } from "@/lib/ksef/client";
import { getKsefClient } from "@/server/ksef/factory";
import type { KsefFetchScope, KsefRunTrigger } from "@/lib/domain/types";
import { stripSeparators } from "@/lib/domain/validation";
import { toDb } from "@/server/enums";

export interface ImportSummary {
  fetched: number;
  imported: number;
  duplicates: number;
  createdCounterparties: number;
}

export interface ImportParams {
  dateFrom: string;
  dateTo: string;
  scope: KsefFetchScope;
  trigger: KsefRunTrigger;
  /** Ustawiane tylko dla przebiegów z harmonogramu — klucz idempotencji. */
  jobName?: string;
  scheduledFor?: Date;
}

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Kartoteka kontrahenta z danych faktury. Kluczem jest NIP bez separatorów,
 * więc ten sam podmiot z KSeF i z formularza trafia na jeden rekord.
 */
async function ensureCounterparty(
  tx: Prisma.TransactionClient,
  invoice: KsefInvoice,
): Promise<{ id: string; defaultCategoryId: string | null; created: boolean }> {
  const party = invoice.direction === "purchase" ? invoice.seller : invoice.buyer;
  const nip = stripSeparators(party.nip);

  const existing = await tx.counterparty.findUnique({
    where: { nip },
    select: { id: true, defaultCategoryId: true },
  });
  if (existing) return { ...existing, created: false };

  const created = await tx.counterparty.create({
    data: {
      name: party.name,
      nip,
      street: party.street || null,
      postalCode: party.postalCode || null,
      city: party.city || null,
      country: party.country || "PL",
      bankAccount: invoice.paymentAccount ? stripSeparators(invoice.paymentAccount) : null,
    },
    select: { id: true, defaultCategoryId: true },
  });
  return { ...created, created: true };
}

export async function importFromKsef(params: ImportParams): Promise<ImportSummary> {
  const [costType, saleType] = await Promise.all([
    prisma.documentType.findFirst({ where: { direction: "PAYABLE", isSystem: true } }),
    prisma.documentType.findFirst({ where: { direction: "RECEIVABLE", isSystem: true } }),
  ]);
  if (!costType || !saleType) {
    throw new KsefError("Brak systemowych typów dokumentów. Uruchom seed bazy.", "unavailable");
  }

  // Wpis historii powstaje przed pobraniem. Dla przebiegu z harmonogramu para
  // (jobName, scheduledFor) jest unikalna, więc druga replika próbująca tego
  // samego przebiegu odpadnie tutaj i nie pobierze faktur po raz drugi.
  const run = await prisma.ksefRun.create({
    data: {
      trigger: toDb(params.trigger),
      scope: toDb(params.scope),
      dateFrom: asDate(params.dateFrom),
      dateTo: asDate(params.dateTo),
      status: "RUNNING",
      jobName: params.jobName ?? null,
      scheduledFor: params.scheduledFor ?? null,
    },
  });

  const summary: ImportSummary = { fetched: 0, imported: 0, duplicates: 0, createdCounterparties: 0 };

  try {
    const settings = await prisma.ksefSchedule.findUnique({ where: { singleton: true } });
    const client = getKsefClient({ simulateFailure: settings?.simulateFailure ?? false });
    const invoices = await client.fetchInvoices({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      scope: params.scope,
    });
    summary.fetched = invoices.length;

    for (const invoice of invoices) {
      try {
        await prisma.$transaction(async (tx) => {
          const counterparty = await ensureCounterparty(tx, invoice);
          if (counterparty.created) summary.createdCounterparties += 1;

          await tx.document.create({
            data: {
              number: invoice.invoiceNumber,
              typeId: invoice.direction === "purchase" ? costType.id : saleType.id,
              counterpartyId: counterparty.id,
              issueDate: asDate(invoice.issueDate),
              saleDate: invoice.saleDate ? asDate(invoice.saleDate) : null,
              dueDate: asDate(invoice.dueDate),
              netAmount: invoice.netAmount,
              vatAmount: invoice.vatAmount,
              grossAmount: invoice.grossAmount,
              currency: invoice.currency,
              paymentAccount: invoice.paymentAccount ? stripSeparators(invoice.paymentAccount) : null,
              // Reguła „kontrahent -> kategoria” działa również przy imporcie.
              categoryId: counterparty.defaultCategoryId,
              categoryAutoAssigned: counterparty.defaultCategoryId !== null,
              source: "KSEF",
              ksefNumber: invoice.ksefNumber,
              stage: "BUFFER",
              bufferDecision: "PENDING",
              receivedAt: new Date(invoice.acquisitionTimestamp),
              lines: {
                create: invoice.lines.map((line: KsefInvoiceLine, index: number) => ({ position: index + 1, ...line })),
              },
            },
          });
        });
        summary.imported += 1;
      } catch (error) {
        // P2002 to nie awaria, tylko faktura, którą już mamy.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          summary.duplicates += 1;
          continue;
        }
        throw error;
      }
    }

    await prisma.ksefRun.update({
      where: { id: run.id },
      data: {
        status: summary.duplicates > 0 && summary.imported === 0 ? "PARTIAL" : "SUCCESS",
        fetched: summary.fetched,
        imported: summary.imported,
        duplicates: summary.duplicates,
        finishedAt: new Date(),
        message:
          summary.duplicates > 0
            ? `Pominięto duplikaty: ${summary.duplicates}.`
            : null,
      },
    });

    return summary;
  } catch (error) {
    // Nieudane pobranie też zostaje w historii — zadanie wymaga czytelnej
    // diagnostyki niedostępności KSeF, a nie cichego zniknięcia przebiegu.
    await prisma.ksefRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        fetched: summary.fetched,
        imported: summary.imported,
        duplicates: summary.duplicates,
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : "Nieznany błąd integracji.",
      },
    });
    throw error;
  }
}
