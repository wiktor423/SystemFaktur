/**
 * Odwzorowanie wierszy bazy na typy domenowe.
 *
 * Granica jest celowa: `src/lib/domain/types.ts` opisuje kształt, którym
 * posługują się API i frontend, i nie może zależeć od tego, jak akurat
 * wyglądają tabele. Dzięki temu zmiana w schemacie nie przecieka do
 * komponentów, a odpowiedzi API pozostają stabilnym kontraktem.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Attachment, Category, Counterparty, DocumentType, InvoiceDocument, InvoiceLine, KsefRun, KsefSchedule } from "@/lib/domain/types";
import { fromDb, stageFromDb } from "@/server/enums";

/** Decimal z bazy na liczbę. Zaokrąglenie do groszy jest tu ostatnią bramką. */
const toNumber = (value: Prisma.Decimal | number): number => Math.round(Number(value) * 100) / 100;

/** Kolumna `@db.Date` wraca jako Date w UTC — bierzemy samą część dzienną. */
const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

export const documentWithRelations = {
  include: { lines: { orderBy: { position: "asc" } }, attachment: true },
} satisfies Prisma.DocumentDefaultArgs;

type DocumentRow = Prisma.DocumentGetPayload<typeof documentWithRelations>;

export function toDocument(row: DocumentRow): InvoiceDocument {
  return {
    id: row.id,
    number: row.number,
    typeId: row.typeId,
    counterpartyId: row.counterpartyId,
    issueDate: toIsoDate(row.issueDate),
    saleDate: row.saleDate ? toIsoDate(row.saleDate) : null,
    dueDate: toIsoDate(row.dueDate),
    netAmount: toNumber(row.netAmount),
    vatAmount: toNumber(row.vatAmount),
    grossAmount: toNumber(row.grossAmount),
    currency: row.currency,
    paymentAccount: row.paymentAccount,
    categoryId: row.categoryId,
    categoryAutoAssigned: row.categoryAutoAssigned,
    source: fromDb(row.source),
    ksefNumber: row.ksefNumber,
    stage: stageFromDb(row.stage),
    bufferDecision: fromDb(row.bufferDecision),
    paymentStatus: fromDb(row.paymentStatus),
    attachment: row.attachment ? toAttachment(row.attachment, row.id) : null,
    lines: row.lines.map(toInvoiceLine),
    notes: row.notes,
    receivedAt: row.receivedAt.toISOString(),
    registeredAt: row.registeredAt?.toISOString() ?? null,
  };
}

function toInvoiceLine(row: Prisma.InvoiceLineGetPayload<object>): InvoiceLine {
  return {
    id: row.id,
    name: row.name,
    quantity: toNumber(row.quantity),
    unit: row.unit,
    unitNetPrice: toNumber(row.unitNetPrice),
    vatRate: toNumber(row.vatRate),
    netAmount: toNumber(row.netAmount),
    vatAmount: toNumber(row.vatAmount),
    grossAmount: toNumber(row.grossAmount),
  };
}

/**
 * Treść załącznika nigdy nie wchodzi do odpowiedzi JSON — plik idzie osobnym
 * strumieniem przez `/api/documents/[id]/attachment`. Inaczej lista rejestru
 * ciągnęłaby ze sobą megabajty base64.
 */
function toAttachment(row: { kind: "PDF" | "XML"; filename: string; size: number }, documentId: string): Attachment {
  return {
    kind: fromDb(row.kind),
    filename: row.filename,
    size: row.size,
    url: `/api/documents/${documentId}/attachment`,
  };
}

export function toCounterparty(row: Prisma.CounterpartyGetPayload<object>): Counterparty {
  return {
    id: row.id,
    name: row.name,
    nip: row.nip,
    address: {
      street: row.street ?? "",
      postalCode: row.postalCode ?? "",
      city: row.city ?? "",
      country: row.country,
    },
    bankAccount: row.bankAccount,
    defaultCategoryId: row.defaultCategoryId,
  };
}

export function toCategory(row: Prisma.CategoryGetPayload<object>): Category {
  return { id: row.id, name: row.name, parentId: row.parentId, color: row.color };
}

export function toDocumentType(row: Prisma.DocumentTypeGetPayload<object>): DocumentType {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    direction: fromDb(row.direction),
    isSystem: row.isSystem,
  };
}

export function toKsefRun(row: Prisma.KsefRunGetPayload<object>): KsefRun {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    trigger: fromDb(row.trigger),
    scope: fromDb(row.scope),
    dateFrom: toIsoDate(row.dateFrom),
    dateTo: toIsoDate(row.dateTo),
    status: row.status === "RUNNING" ? "partial" : fromDb(row.status as "SUCCESS" | "PARTIAL" | "ERROR"),
    fetched: row.fetched,
    imported: row.imported,
    duplicates: row.duplicates,
    message: row.message,
  };
}

export function toSchedule(row: Prisma.KsefScheduleGetPayload<object>): KsefSchedule {
  return {
    enabled: row.enabled,
    times: row.times,
    scope: fromDb(row.scope),
    lookbackDays: row.lookbackDays,
    simulateFailure: row.simulateFailure,
  };
}
