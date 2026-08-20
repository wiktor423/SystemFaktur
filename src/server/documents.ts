/**
 * Logika rejestru i bufora po stronie serwera.
 *
 * Filtrowanie, sortowanie i stronicowanie wykonuje baza, nie aplikacja —
 * rejestr ma rosnąć, a wczytywanie wszystkich dokumentów do pamięci po to,
 * żeby odrzucić 95% z nich, przestaje działać przy pierwszym większym
 * kliencie. Reguły czysto domenowe (rozwinięcie kategorii o poddrzewo)
 * pochodzą z tych samych czystych funkcji, których używa frontend.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { categoryWithDescendants, type RegisterStats } from "@/lib/data/queries";
import type { InvoiceDocument } from "@/lib/domain/types";
import type { createDocumentSchema, documentFiltersSchema, updateDocumentSchema } from "@/lib/validation/schemas";
import type { z } from "zod";
import { documentWithRelations, toCategory, toDocument } from "@/server/mappers";
import { stageToDb, toDb } from "@/server/enums";

type Filters = z.infer<typeof documentFiltersSchema>;
type CreateInput = z.infer<typeof createDocumentSchema>;
type UpdateInput = z.infer<typeof updateDocumentSchema>;

/** Kolumny, po których wolno sortować — lista zamknięta, bo trafia do zapytania. */
const SORTABLE = {
  number: "number",
  issueDate: "issueDate",
  dueDate: "dueDate",
  netAmount: "netAmount",
  vatAmount: "vatAmount",
  grossAmount: "grossAmount",
  counterparty: "counterpartyId",
  type: "typeId",
  category: "categoryId",
  source: "source",
  paymentStatus: "paymentStatus",
  ksefNumber: "ksefNumber",
  nip: "counterpartyId",
  paymentAccount: "paymentAccount",
} as const;

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function buildWhere(filters: Filters): Promise<Prisma.DocumentWhereInput> {
  const where: Prisma.DocumentWhereInput = {};
  const and: Prisma.DocumentWhereInput[] = [];

  if (filters.stage) where.stage = stageToDb(filters.stage);
  if (filters.typeIds.length) where.typeId = { in: filters.typeIds };
  if (filters.counterpartyIds.length) where.counterpartyId = { in: filters.counterpartyIds };
  if (filters.sources.length) where.source = { in: filters.sources.map(toDb) };
  if (filters.paymentStatuses.length) where.paymentStatus = { in: filters.paymentStatuses.map(toDb) };

  // Filtr po kategorii obejmuje całe poddrzewo — wybranie "Logistyka" musi
  // pokazać też "Transport chłodniczy". Kategorii są dziesiątki, więc
  // rozwinięcie w pamięci jest tańsze niż rekurencyjne CTE.
  if (filters.categoryIds.length) {
    const categories = (await prisma.category.findMany()).map(toCategory);
    const expanded = new Set(filters.categoryIds.flatMap((id) => categoryWithDescendants(categories, id)));
    where.categoryId = { in: [...expanded] };
  }

  if (filters.issueDateFrom || filters.issueDateTo) {
    where.issueDate = {
      ...(filters.issueDateFrom ? { gte: asDate(filters.issueDateFrom) } : {}),
      ...(filters.issueDateTo ? { lte: asDate(filters.issueDateTo) } : {}),
    };
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {
      ...(filters.dueDateFrom ? { gte: asDate(filters.dueDateFrom) } : {}),
      ...(filters.dueDateTo ? { lte: asDate(filters.dueDateTo) } : {}),
    };
  }

  const search = filters.search.trim();
  if (search) {
    and.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { ksefNumber: { contains: search, mode: "insensitive" } },
        { counterparty: { name: { contains: search, mode: "insensitive" } } },
        { counterparty: { nip: { contains: search.replace(/[^0-9]/g, "") || " " } } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

export interface DocumentPage {
  documents: InvoiceDocument[];
  total: number;
  page: number;
  pageSize: number;
  /** Podsumowanie liczone dla CALEGO wyniku filtrowania, nie dla biezacej strony. */
  stats: RegisterStats;
}

/**
 * Kafelki nad rejestrem podsumowuja komplet dokumentow spelniajacych filtry,
 * a nie widoczna strone - inaczej "zobowiazania do zaplaty" zmienialyby sie
 * przy przewijaniu listy. Agregat liczy baza jednym zapytaniem; sciaganie
 * wszystkich wierszy tylko po to, zeby je zsumowac w Node, byloby marnotrawstwem.
 */
async function computeStatsInDatabase(where: Prisma.DocumentWhereInput): Promise<RegisterStats> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const inSevenDays = new Date(today);
  inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);

  const unpaid: Prisma.DocumentWhereInput = { AND: [where, { paymentStatus: { not: "PAID" } }] };
  const overdue: Prisma.DocumentWhereInput = { AND: [unpaid, { dueDate: { lt: today } }] };

  // Wszystko jednym obiegiem do bazy zamiast szesciu osobnych zapytan.
  const [openByType, overdueByType, overdueCount, dueSoonCount, documentCount] = await prisma.$transaction([
    prisma.document.groupBy({ by: ["typeId"], where: unpaid, _sum: { grossAmount: true }, orderBy: { typeId: "asc" } }),
    prisma.document.groupBy({ by: ["typeId"], where: overdue, _sum: { grossAmount: true }, orderBy: { typeId: "asc" } }),
    prisma.document.count({ where: overdue }),
    prisma.document.count({ where: { AND: [unpaid, { dueDate: { gte: today, lte: inSevenDays } }] } }),
    prisma.document.count({ where }),
  ]);

  const types = await prisma.documentType.findMany({ select: { id: true, direction: true } });
  const directionOf = new Map(types.map((type) => [type.id, type.direction]));

  const stats: RegisterStats = {
    payableOpen: 0,
    payableOverdue: 0,
    receivableOpen: 0,
    receivableOverdue: 0,
    overdueCount,
    dueThisWeekCount: dueSoonCount,
    documentCount,
  };

  for (const group of openByType) {
    const amount = Number(group._sum?.grossAmount ?? 0);
    if (directionOf.get(group.typeId) === "RECEIVABLE") stats.receivableOpen += amount;
    else stats.payableOpen += amount;
  }
  for (const group of overdueByType) {
    const amount = Number(group._sum?.grossAmount ?? 0);
    if (directionOf.get(group.typeId) === "RECEIVABLE") stats.receivableOverdue += amount;
    else stats.payableOverdue += amount;
  }

  return stats;
}

export async function listDocuments(filters: Filters): Promise<DocumentPage> {
  const where = await buildWhere(filters);
  const column = SORTABLE[filters.sortKey as keyof typeof SORTABLE] ?? "issueDate";

  const [total, rows] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      ...documentWithRelations,
      // Numer jako kryterium pomocnicze — bez niego kolejność rekordów
      // o równej dacie potrafi się zmieniać między stronami.
      orderBy: [{ [column]: filters.sortDirection }, { number: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  const stats = await computeStatsInDatabase(where);

  return {
    documents: rows.map(toDocument),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    stats,
  };
}

export async function getDocument(id: string): Promise<InvoiceDocument | null> {
  const row = await prisma.document.findUnique({ where: { id }, ...documentWithRelations });
  return row ? toDocument(row) : null;
}

/**
 * Reguła "kontrahent -> kategoria". Ręczny wybór ma pierwszeństwo, więc reguła
 * uzupełnia wyłącznie brak kategorii — nigdy nie nadpisuje decyzji użytkownika.
 */
async function resolveCategory(counterpartyId: string, explicitCategoryId: string | null) {
  if (explicitCategoryId) return { categoryId: explicitCategoryId, categoryAutoAssigned: false };

  const counterparty = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { defaultCategoryId: true },
  });
  const auto = counterparty?.defaultCategoryId ?? null;
  return { categoryId: auto, categoryAutoAssigned: auto !== null };
}

export class DuplicateDocumentError extends Error {
  constructor(readonly field: "ksefNumber" | "number") {
    super(
      field === "ksefNumber"
        ? "Dokument o tym numerze KSeF już istnieje."
        : "Dokument o tym numerze dla tego kontrahenta już istnieje.",
    );
    this.name = "DuplicateDocumentError";
  }
}

/** Zamienia naruszenie unikalności z bazy na błąd domenowy. */
function rethrowAsDomainError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta?.target ?? []) as string[];
    throw new DuplicateDocumentError(target.includes("ksefNumber") ? "ksefNumber" : "number");
  }
  throw error;
}

export async function createDocument(input: CreateInput): Promise<InvoiceDocument> {
  const category = await resolveCategory(input.counterpartyId, input.categoryId);
  const registered = input.stage === "registered";

  try {
    const row = await prisma.document.create({
      data: {
        number: input.number,
        typeId: input.typeId,
        counterpartyId: input.counterpartyId,
        issueDate: asDate(input.issueDate),
        saleDate: input.saleDate ? asDate(input.saleDate) : null,
        dueDate: asDate(input.dueDate),
        netAmount: input.netAmount,
        vatAmount: input.vatAmount,
        grossAmount: input.grossAmount,
        currency: input.currency,
        paymentAccount: input.paymentAccount,
        categoryId: category.categoryId,
        categoryAutoAssigned: category.categoryAutoAssigned,
        source: toDb(input.source),
        stage: stageToDb(input.stage),
        bufferDecision: registered ? "ACCEPTED" : "PENDING",
        registeredAt: registered ? new Date() : null,
        notes: input.notes,
        lines: {
          create: input.lines.map((line, index) => ({ position: index + 1, ...line })),
        },
      },
      ...documentWithRelations,
    });
    return toDocument(row);
  } catch (error) {
    rethrowAsDomainError(error);
  }
}

export async function updateDocument(id: string, input: UpdateInput): Promise<InvoiceDocument> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { documentId: id } });
      return tx.document.update({
        where: { id },
        data: {
          number: input.number,
          typeId: input.typeId,
          counterpartyId: input.counterpartyId,
          issueDate: asDate(input.issueDate),
          saleDate: input.saleDate ? asDate(input.saleDate) : null,
          dueDate: asDate(input.dueDate),
          netAmount: input.netAmount,
          vatAmount: input.vatAmount,
          grossAmount: input.grossAmount,
          currency: input.currency,
          paymentAccount: input.paymentAccount,
          categoryId: input.categoryId,
          // Zapis z formularza jest zawsze decyzją użytkownika, więc znacznik
          // automatycznego przypisania gaśnie.
          categoryAutoAssigned: false,
          notes: input.notes,
          lines: { create: input.lines.map((line, index) => ({ position: index + 1, ...line })) },
        },
        ...documentWithRelations,
      });
    });
    return toDocument(row);
  } catch (error) {
    rethrowAsDomainError(error);
  }
}

export async function deleteDocuments(ids: string[]): Promise<number> {
  const { count } = await prisma.document.deleteMany({ where: { id: { in: ids } } });
  return count;
}

/**
 * Akceptacja pozycji bufora. Warunek `stage: BUFFER` w zapytaniu jest istotny:
 * ponowne wysłanie tego samego żądania nie przeniesie dokumentu drugi raz i
 * nie nadpisze daty rejestracji.
 */
export async function acceptFromBuffer(ids: string[]): Promise<number> {
  const { count } = await prisma.document.updateMany({
    where: { id: { in: ids }, stage: "BUFFER" },
    data: { stage: "REGISTERED", bufferDecision: "ACCEPTED", registeredAt: new Date() },
  });
  return count;
}

export async function rejectFromBuffer(ids: string[]): Promise<number> {
  const { count } = await prisma.document.updateMany({
    where: { id: { in: ids }, stage: "BUFFER" },
    data: { bufferDecision: "REJECTED" },
  });
  return count;
}
