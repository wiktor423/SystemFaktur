import { prisma } from "@/lib/db";
import { DEFAULT_COLUMNS } from "@/lib/data/columns";
import type { ColumnConfig, DocumentColumnKey } from "@/lib/domain/types";
import { toCategory, toCounterparty, toDocumentType, toKsefRun, toSchedule } from "@/server/mappers";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Komplet danych słownikowych dla jednego wejścia do aplikacji.
 *
 * Frontend potrzebuje kategorii, typów, kontrahentów i ustawień zanim
 * cokolwiek narysuje. Cztery osobne żądania z przeglądarki to cztery
 * obiegi sieci i cztery stany ładowania; jedno zapytanie równolegle po
 * stronie serwera jest szybsze i prostsze w obsłudze.
 */
export async function GET() {
  return handle(async () => {
    const [categories, documentTypes, counterparties, schedule, runs, columns, bufferCount, byCategory, byCounterparty, uncategorized, byType] =
      await Promise.all([
        prisma.category.findMany({ orderBy: { name: "asc" } }),
        prisma.documentType.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
        prisma.counterparty.findMany({ orderBy: { name: "asc" } }),
        prisma.ksefSchedule.findUnique({ where: { id: 1 } }),
        prisma.ksefRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
        prisma.columnPreference.findMany({ orderBy: { position: "asc" } }),
        prisma.document.count({ where: { stage: "BUFFER", bufferDecision: "PENDING" } }),
        // Liczniki przy kategoriach i kontrahentach to agregaty, a nie
        // pochodna listy dokumentow - dzieki temu widoki zbiorcze nie
        // wymagaja sciagania calego rejestru do przegladarki.
        prisma.document.groupBy({
          by: ["categoryId"],
          where: { categoryId: { not: null }, currency: "PLN" },
          _count: { _all: true },
          _sum: { grossAmount: true },
          orderBy: { categoryId: "asc" },
        }),
        prisma.document.groupBy({
          by: ["counterpartyId"],
          where: { currency: "PLN" },
          _count: { _all: true },
          _sum: { grossAmount: true },
          orderBy: { counterpartyId: "asc" },
        }),
        prisma.document.count({ where: { categoryId: null } }),
        prisma.document.groupBy({ by: ["typeId"], _count: { _all: true }, orderBy: { typeId: "asc" } }),
      ]);

    return ok({
      categories: categories.map(toCategory),
      documentTypes: documentTypes.map(toDocumentType),
      counterparties: counterparties.map(toCounterparty),
      schedule: schedule ? toSchedule(schedule) : null,
      ksefRuns: runs.map(toKsefRun),
      columns: columns.length
        ? columns.map((column): ColumnConfig => ({ key: column.key as DocumentColumnKey, visible: column.visible }))
        : DEFAULT_COLUMNS,
      usage: {
        bufferCount,
        uncategorized,
        byCategory: byCategory.map((group) => ({
          id: group.categoryId as string,
          count: group._count?._all ?? 0,
          amount: Number(group._sum?.grossAmount ?? 0),
        })),
        byCounterparty: byCounterparty.map((group) => ({
          id: group.counterpartyId,
          count: group._count?._all ?? 0,
          amount: Number(group._sum?.grossAmount ?? 0),
        })),
        byType: byType.map((group) => ({ id: group.typeId, count: group._count?._all ?? 0, amount: 0 })),
      },
    });
  });
}
